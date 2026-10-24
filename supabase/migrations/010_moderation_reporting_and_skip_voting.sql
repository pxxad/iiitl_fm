-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 010_moderation_reporting_and_skip_voting.sql
-- IIITL FM — Roles, Moderation, and Atomic Skip-Voting
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Role Enum & Profile Column ──────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('student', 'moderator', 'admin');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS role public.user_role NOT NULL DEFAULT 'student';

-- ─── 2. Column-Level Privilege Lockdown on profiles ─────────────────────────
-- Regular students can update profile details, but NOT the role column
REVOKE UPDATE ON public.profiles FROM authenticated, anon, PUBLIC;
GRANT UPDATE (full_name, avatar_url, branch, batch) ON public.profiles TO authenticated;

-- ─── 3. Anti-Escalation Trigger (SECURITY INVOKER) ──────────────────────────
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, auth, pg_catalog
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Allowed only for database administrators in SQL Editor or SECURITY DEFINER admin RPC
    IF current_user NOT IN ('postgres', 'supabase_admin') THEN
      RAISE EXCEPTION 'Forbidden: direct modification of the role column is prohibited';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role();

-- ─── 4. Admin-Only Role Assignment RPC (SECURITY DEFINER) ───────────────────
CREATE OR REPLACE FUNCTION public.admin_set_user_role(
  p_target_user_id UUID,
  p_new_role public.user_role
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_caller_role public.user_role;
BEGIN
  -- 1. Validate caller identity from auth.uid()
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_caller_role 
  FROM public.profiles 
  WHERE id = auth.uid();

  IF v_caller_role IS NULL OR v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Forbidden: only campus administrators can assign roles';
  END IF;

  -- 2. Target existence check
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target_user_id) THEN
    RAISE EXCEPTION 'Target user not found';
  END IF;

  -- 3. Execute update as postgres (satisfies protect_profile_role trigger)
  UPDATE public.profiles 
  SET role = p_new_role 
  WHERE id = p_target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_user_role(UUID, public.user_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_role(UUID, public.user_role) TO authenticated;

-- ─── 5. Direct Client Access Restriction on skip_votes ──────────────────────
-- Revoke direct table mutations: all voting must go through cast_skip_vote_and_evaluate
DROP POLICY IF EXISTS "SkipVotes: authenticated students can vote" ON public.skip_votes;
DROP POLICY IF EXISTS "SkipVotes: users can remove own vote" ON public.skip_votes;
REVOKE INSERT, UPDATE, DELETE ON public.skip_votes FROM authenticated, anon, PUBLIC;

-- Keep read-only SELECT for connected listeners to observe vote progress
DROP POLICY IF EXISTS "SkipVotes: authenticated students can read" ON public.skip_votes;
DROP POLICY IF EXISTS "SkipVotes: public read" ON public.skip_votes;
CREATE POLICY "SkipVotes: public read"
  ON public.skip_votes FOR SELECT
  USING (true);

-- ─── 6. Atomic Skip Voting & Advancement RPC ────────────────────────────────
CREATE OR REPLACE FUNCTION public.cast_skip_vote_and_evaluate(
  p_expected_song_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_active_song_id UUID;
  v_playback_status public.playback_status;
  v_song_status public.song_status;
  v_voted BOOLEAN;
  v_total_votes INT;
  v_threshold CONSTANT INT := 3; -- Documented fixed MVP quorum
  v_advance_result JSONB;
  v_advanced BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to vote';
  END IF;

  -- 1. Authoritative campus domain verification (verified email in auth.users)
  IF NOT EXISTS (
    SELECT 1 
    FROM auth.users
    WHERE id = v_user_id
      AND email_confirmed_at IS NOT NULL
      AND lower(trim(email)) LIKE '%@iiitl.ac.in'
      AND split_part(lower(trim(email)), '@', 2) = 'iiitl.ac.in'
  ) THEN
    RAISE EXCEPTION 'Forbidden: verified @iiitl.ac.in campus email required';
  END IF;

  -- 2. Transactional advisory lock to serialize vote processing for this song
  PERFORM pg_advisory_xact_lock(hashtext('skip_vote_' || p_expected_song_id::text));

  -- 3. Lock playback_state singleton row
  SELECT current_song_id, playback_status 
  INTO v_active_song_id, v_playback_status
  FROM public.playback_state 
  WHERE id = 'singleton'
  FOR UPDATE;

  -- 4. Stale Check: Reject vote if song is no longer playing
  IF v_active_song_id IS NULL OR v_active_song_id <> p_expected_song_id OR v_playback_status <> 'playing' THEN
    RETURN jsonb_build_object(
      'error', 'stale_song',
      'message', 'This track is no longer actively playing',
      'current_song_id', v_active_song_id
    );
  END IF;

  -- 5. Lock and verify song record
  SELECT status INTO v_song_status 
  FROM public.songs 
  WHERE id = p_expected_song_id 
  FOR UPDATE;

  IF v_song_status <> 'playing' THEN
    RETURN jsonb_build_object(
      'error', 'stale_song',
      'message', 'Song is not active'
    );
  END IF;

  -- 6. Toggle vote in public.skip_votes
  IF EXISTS (SELECT 1 FROM public.skip_votes WHERE song_id = p_expected_song_id AND user_id = v_user_id) THEN
    DELETE FROM public.skip_votes WHERE song_id = p_expected_song_id AND user_id = v_user_id;
    v_voted := false;
  ELSE
    INSERT INTO public.skip_votes (song_id, user_id) VALUES (p_expected_song_id, v_user_id);
    v_voted := true;
  END IF;

  -- 7. Count distinct verified votes for the expected song
  SELECT count(*)::INT INTO v_total_votes 
  FROM public.skip_votes 
  WHERE song_id = p_expected_song_id;

  -- 8. Atomic Threshold Evaluation & Advancement
  IF v_total_votes >= v_threshold THEN
    -- Advance playback queue within the exact same database transaction
    v_advance_result := public.advance_playback_queue(p_expected_song_id, 'skipped');
    v_advanced := coalesce((v_advance_result->>'advanced')::BOOLEAN, false);

    -- Clean up votes for the skipped track to prevent cross-song leakage
    DELETE FROM public.skip_votes WHERE song_id = p_expected_song_id;
  END IF;

  RETURN jsonb_build_object(
    'song_id', p_expected_song_id,
    'voted', v_voted,
    'total_votes', v_total_votes,
    'threshold', v_threshold,
    'advanced', v_advanced
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cast_skip_vote_and_evaluate(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cast_skip_vote_and_evaluate(UUID) TO authenticated;

-- ─── 7. Content Visibility Flags & Moderation Tables ────────────────────────
ALTER TABLE public.chat_messages 
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.songs 
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- Reports table
CREATE TABLE IF NOT EXISTS public.reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('song', 'chat_message')),
  target_id   UUID NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('offensive_content', 'hate_speech', 'copyright', 'spam', 'harassment', 'other')),
  details     TEXT CHECK (details IS NULL OR char_length(details) <= 300),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reports: verified campus students can insert"
  ON public.reports FOR INSERT
  WITH CHECK (
    auth.uid() = reporter_id
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND auth.users.email_confirmed_at IS NOT NULL
        AND split_part(lower(trim(auth.users.email)), '@', 2) = 'iiitl.ac.in'
    )
  );

CREATE POLICY "Reports: moderators and admins can read"
  ON public.reports FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('moderator', 'admin')
    )
  );

CREATE POLICY "Reports: moderators and admins can update"
  ON public.reports FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('moderator', 'admin')
    )
  );

-- Moderation actions audit table
CREATE TABLE IF NOT EXISTS public.moderation_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  moderator_id  UUID NOT NULL REFERENCES public.profiles(id),
  action_type   TEXT NOT NULL CHECK (action_type IN ('hide_chat', 'skip_song', 'dismiss_report')),
  target_type   TEXT NOT NULL CHECK (target_type IN ('song', 'chat_message')),
  target_id     UUID NOT NULL,
  reason        TEXT NOT NULL CHECK (char_length(trim(reason)) > 0 AND char_length(reason) <= 300),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.moderation_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ModerationActions: moderators can manage"
  ON public.moderation_actions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('moderator', 'admin')
    )
  );

-- Moderation Action RPC: hide chat message
CREATE OR REPLACE FUNCTION public.moderate_hide_chat(
  p_message_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_mod_role public.user_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_mod_role FROM public.profiles WHERE id = auth.uid();
  IF v_mod_role NOT IN ('moderator', 'admin') THEN
    RAISE EXCEPTION 'Forbidden: moderator privileges required';
  END IF;

  UPDATE public.chat_messages SET is_hidden = true WHERE id = p_message_id;

  INSERT INTO public.moderation_actions (moderator_id, action_type, target_type, target_id, reason)
  VALUES (auth.uid(), 'hide_chat', 'chat_message', p_message_id, p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_hide_chat(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_hide_chat(UUID, TEXT) TO authenticated;

-- Moderation Action RPC: skip song with audit logging
CREATE OR REPLACE FUNCTION public.moderate_skip_song(
  p_song_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_mod_role public.user_role;
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT role INTO v_mod_role FROM public.profiles WHERE id = auth.uid();
  IF v_mod_role NOT IN ('moderator', 'admin') THEN
    RAISE EXCEPTION 'Forbidden: moderator privileges required';
  END IF;

  -- Advance queue as skipped
  v_result := public.advance_playback_queue(p_song_id, 'skipped');

  -- Also set is_hidden = true on the song if requested
  UPDATE public.songs SET is_hidden = true WHERE id = p_song_id;

  INSERT INTO public.moderation_actions (moderator_id, action_type, target_type, target_id, reason)
  VALUES (auth.uid(), 'skip_song', 'song', p_song_id, p_reason);

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_skip_song(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_skip_song(UUID, TEXT) TO authenticated;

-- Update get_recent_chat_messages to filter hidden messages
CREATE OR REPLACE FUNCTION public.get_recent_chat_messages(p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  content TEXT,
  created_at TIMESTAMPTZ,
  full_name TEXT,
  avatar_url TEXT,
  branch TEXT,
  batch TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
  SELECT 
    m.id,
    m.user_id,
    m.content,
    m.created_at,
    p.full_name,
    p.avatar_url,
    p.branch,
    p.batch
  FROM public.chat_messages m
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE m.is_hidden = false
  ORDER BY m.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;
