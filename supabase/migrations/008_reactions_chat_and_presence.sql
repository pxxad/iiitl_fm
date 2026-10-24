-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 008_reactions_chat_and_presence.sql
-- IIITL FM — Real-Time Reactions, Live Chat, and Presence Architecture
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Refine Reactions Schema ───────────────────────────────────────────────
-- Ensure each campus student can have at most one active reaction per song.
-- Users can change their reaction to a different emoji or toggle it off.
ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS uq_one_reaction_per_type;
ALTER TABLE public.reactions DROP CONSTRAINT IF EXISTS uq_one_reaction_per_user_per_song;

-- Remove any existing duplicate reactions for the same (song_id, user_id) preserving the latest
DELETE FROM public.reactions r1
WHERE r1.created_at < (
  SELECT MAX(r2.created_at)
  FROM public.reactions r2
  WHERE r2.song_id = r1.song_id AND r2.user_id = r1.user_id
);

ALTER TABLE public.reactions
  ADD CONSTRAINT uq_one_reaction_per_user_per_song UNIQUE (song_id, user_id);

-- ─── 2. RLS for Reactions ────────────────────────────────────────────────────
-- Public read so listeners (even unauthenticated guests) can view reaction counts
DROP POLICY IF EXISTS "Reactions: authenticated students can read all" ON public.reactions;
DROP POLICY IF EXISTS "Reactions: public read" ON public.reactions;
CREATE POLICY "Reactions: public read"
  ON public.reactions FOR SELECT
  USING (true);

-- Authenticated students can add or update their own reaction
DROP POLICY IF EXISTS "Reactions: authenticated students can add" ON public.reactions;
DROP POLICY IF EXISTS "Reactions: authenticated students can insert own" ON public.reactions;
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

DROP POLICY IF EXISTS "Reactions: authenticated students can update own" ON public.reactions;
CREATE POLICY "Reactions: authenticated students can update own"
  ON public.reactions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Reactions: users can delete own reactions" ON public.reactions;
CREATE POLICY "Reactions: users can delete own reactions"
  ON public.reactions FOR DELETE
  USING (auth.uid() = user_id);


-- ─── 3. Atomic Reaction Toggle Function ───────────────────────────────────────
-- Toggles a user's reaction on a song:
-- If same emoji is clicked -> removes it.
-- If different emoji is clicked -> changes it.
-- If no prior reaction -> inserts it.
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

  -- Check existing reaction for this user and song
  SELECT * INTO v_existing_reaction
  FROM public.reactions
  WHERE song_id = p_song_id AND user_id = v_user_id;

  IF FOUND THEN
    IF v_existing_reaction.reaction_type = p_reaction_type THEN
      -- Same reaction clicked: remove/toggle off
      DELETE FROM public.reactions WHERE id = v_existing_reaction.id;
      v_action := 'removed';
    ELSE
      -- Different reaction: update/change
      UPDATE public.reactions
      SET reaction_type = p_reaction_type,
          created_at = now()
      WHERE id = v_existing_reaction.id;
      v_action := 'changed';
    END IF;
  ELSE
    -- No previous reaction: insert new
    INSERT INTO public.reactions (song_id, user_id, reaction_type)
    VALUES (p_song_id, v_user_id, p_reaction_type);
    v_action := 'added';
  END IF;

  -- Compute aggregated counts for the song
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


-- ─── 4. Live Chat Messages Table ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(trim(content)) > 0 AND char_length(content) <= 200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for retrieving bounded recent chat messages
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at 
  ON public.chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id 
  ON public.chat_messages(user_id);

-- Enable Row Level Security
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Public read: All connected room listeners (including guests) can read live chat
DROP POLICY IF EXISTS "Chat: public read" ON public.chat_messages;
CREATE POLICY "Chat: public read"
  ON public.chat_messages FOR SELECT
  USING (true);

-- Authenticated send: Only verified @iiitl.ac.in students can send messages
DROP POLICY IF EXISTS "Chat: authenticated campus students can send" ON public.chat_messages;
CREATE POLICY "Chat: authenticated campus students can send"
  ON public.chat_messages FOR INSERT
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

-- No client updates or deletes for chat messages
DROP POLICY IF EXISTS "Chat: no client updates" ON public.chat_messages;
DROP POLICY IF EXISTS "Chat: no client deletes" ON public.chat_messages;


-- ─── 5. Helper Function: get_recent_chat_messages ─────────────────────────────
-- Returns the latest N messages safely joined with profile metadata.
-- Omits any personal emails or sensitive details.
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
  ORDER BY m.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$$;


-- ─── 6. Enable Realtime Publications ──────────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'chat_messages') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'reactions') THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
    END IF;
  END IF;
END $$;

