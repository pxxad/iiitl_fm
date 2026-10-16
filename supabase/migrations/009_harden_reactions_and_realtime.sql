-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 009_harden_reactions_and_realtime.sql
-- IIITL FM — Hardened Reaction Concurrency, Strict RLS Policies & Verification
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Hardened Reaction RLS Policies ───────────────────────────────────────
-- Enforce campus domain verification across ALL mutation policies: INSERT, UPDATE, DELETE.
-- Both USING and WITH CHECK are strictly locked to auth.uid() and verified @iiitl.ac.in email.

-- 1.1 INSERT
DROP POLICY IF EXISTS "Reactions: authenticated students can insert own" ON public.reactions;
DROP POLICY IF EXISTS "Reactions: authenticated students can add" ON public.reactions;
CREATE POLICY "Reactions: authenticated students can insert own"
  ON public.reactions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'email' LIKE '%@iiitl.ac.in'
        OR auth.users.email LIKE '%@iiitl.ac.in'
      )
    )
  );

-- 1.2 UPDATE
DROP POLICY IF EXISTS "Reactions: authenticated students can update own" ON public.reactions;
CREATE POLICY "Reactions: authenticated students can update own"
  ON public.reactions FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'email' LIKE '%@iiitl.ac.in'
        OR auth.users.email LIKE '%@iiitl.ac.in'
      )
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'email' LIKE '%@iiitl.ac.in'
        OR auth.users.email LIKE '%@iiitl.ac.in'
      )
    )
  );

-- 1.3 DELETE
DROP POLICY IF EXISTS "Reactions: users can delete own reactions" ON public.reactions;
DROP POLICY IF EXISTS "Reactions: authenticated students can delete own" ON public.reactions;
CREATE POLICY "Reactions: authenticated students can delete own"
  ON public.reactions FOR DELETE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND (
        auth.users.raw_user_meta_data->>'email' LIKE '%@iiitl.ac.in'
        OR auth.users.email LIKE '%@iiitl.ac.in'
      )
    )
  );


-- ─── 2. Concurrency-Safe Reaction Toggle RPC ─────────────────────────────────
-- Replaces toggle_song_reaction with strict transaction serialization,
-- row locking, and conflict handling to prevent unhandled unique violations.
CREATE OR REPLACE FUNCTION public.toggle_song_reaction(
  p_song_id UUID,
  p_reaction_type reaction_type
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_user_id UUID;
  v_existing_reaction public.reactions;
  v_action TEXT;
  v_counts JSONB;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to react';
  END IF;

  -- Verify campus membership at DB layer
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = v_user_id
    AND (
      auth.users.raw_user_meta_data->>'email' LIKE '%@iiitl.ac.in'
      OR auth.users.email LIKE '%@iiitl.ac.in'
    )
  ) THEN
    RAISE EXCEPTION 'Forbidden: only verified @iiitl.ac.in campus members can react';
  END IF;

  -- 1. Acquire transaction-level advisory lock on (user_id, song_id) to serialize
  -- rapid concurrent requests from the same user on the same song.
  PERFORM pg_advisory_xact_lock(hashtext(v_user_id::text), hashtext(p_song_id::text));

  -- 2. Inspect existing reaction with row lock
  SELECT * INTO v_existing_reaction
  FROM public.reactions
  WHERE song_id = p_song_id AND user_id = v_user_id
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_reaction.reaction_type = p_reaction_type THEN
      -- Same reaction clicked: remove / toggle off
      DELETE FROM public.reactions WHERE id = v_existing_reaction.id;
      v_action := 'removed';
    ELSE
      -- Different reaction: update / change
      UPDATE public.reactions
      SET reaction_type = p_reaction_type,
          created_at = now()
      WHERE id = v_existing_reaction.id;
      v_action := 'changed';
    END IF;
  ELSE
    -- No previous reaction found: attempt insert
    BEGIN
      INSERT INTO public.reactions (song_id, user_id, reaction_type)
      VALUES (p_song_id, v_user_id, p_reaction_type);
      v_action := 'added';
    EXCEPTION WHEN unique_violation THEN
      -- Concurrency fallback: another statement committed an insert concurrently.
      -- Re-select with row lock and re-evaluate toggle semantics.
      SELECT * INTO v_existing_reaction
      FROM public.reactions
      WHERE song_id = p_song_id AND user_id = v_user_id
      FOR UPDATE;

      IF FOUND THEN
        IF v_existing_reaction.reaction_type = p_reaction_type THEN
          DELETE FROM public.reactions WHERE id = v_existing_reaction.id;
          v_action := 'removed';
        ELSE
          UPDATE public.reactions
          SET reaction_type = p_reaction_type,
              created_at = now()
          WHERE id = v_existing_reaction.id;
          v_action := 'changed';
        END IF;
      ELSE
        -- Row was deleted between violation and re-select; upsert cleanly
        INSERT INTO public.reactions (song_id, user_id, reaction_type)
        VALUES (p_song_id, v_user_id, p_reaction_type)
        ON CONFLICT (song_id, user_id) DO UPDATE
          SET reaction_type = EXCLUDED.reaction_type,
              created_at = now();
        v_action := 'added';
      END IF;
    END;
  END IF;

  -- 3. Compute aggregated counts for the song
  SELECT jsonb_object_agg(reaction_type, cnt) INTO v_counts
  FROM (
    SELECT reaction_type, count(*)::INT as cnt
    FROM public.reactions
    WHERE song_id = p_song_id
    GROUP BY reaction_type
  ) sub;

  IF v_counts IS NULL THEN
    v_counts := '{}'::JSONB;
  END IF;

  RETURN jsonb_build_object(
    'action', v_action,
    'reaction_type', CASE WHEN v_action = 'removed' THEN NULL ELSE p_reaction_type END,
    'counts', v_counts
  );
END;
$$;

-- ─── 3. Function Permissions Hardening ───────────────────────────────────────
REVOKE ALL ON FUNCTION public.toggle_song_reaction(UUID, reaction_type) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_song_reaction(UUID, reaction_type) TO authenticated;
