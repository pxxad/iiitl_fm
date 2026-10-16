-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 002_rls_policies.sql
-- IIITL FM — Row Level Security policies
--
-- Run AFTER 001_initial_schema.sql
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Enable RLS on all tables ────────────────────────────────────────────────
ALTER TABLE public.profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_queues  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.songs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playback_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skip_votes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_stats   ENABLE ROW LEVEL SECURITY;


-- ─── Helper: is the user authenticated with an @iiitl.ac.in email? ───────────
-- NOTE: Domain check is a first layer of defence.
-- Full student verification can be added in Phase 2 via an approved_students table.
CREATE OR REPLACE FUNCTION public.is_iiitl_student()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    auth.role() = 'authenticated'
    AND (auth.jwt() ->> 'email') LIKE '%@iiitl.ac.in'
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- profiles
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Profiles: authenticated students can read all" ON public.profiles;
CREATE POLICY "Profiles: authenticated students can read all"
  ON public.profiles FOR SELECT
  USING (public.is_iiitl_student());

DROP POLICY IF EXISTS "Profiles: users can update their own profile" ON public.profiles;
CREATE POLICY "Profiles: users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id AND public.is_iiitl_student())
  WITH CHECK (auth.uid() = id);

-- Inserts are handled by the trigger (SECURITY DEFINER), not by RLS.
-- No INSERT policy needed for profiles.


-- ═══════════════════════════════════════════════════════════════════════════════
-- daily_queues
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Queues: authenticated students can read all" ON public.daily_queues;
CREATE POLICY "Queues: authenticated students can read all"
  ON public.daily_queues FOR SELECT
  USING (public.is_iiitl_student());

-- No INSERT/UPDATE policy for students — queues are created server-side only.


-- ═══════════════════════════════════════════════════════════════════════════════
-- songs
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Songs: authenticated students can read all" ON public.songs;
CREATE POLICY "Songs: authenticated students can read all"
  ON public.songs FOR SELECT
  USING (public.is_iiitl_student());

DROP POLICY IF EXISTS "Songs: authenticated students can submit" ON public.songs;
CREATE POLICY "Songs: authenticated students can submit"
  ON public.songs FOR INSERT
  WITH CHECK (
    public.is_iiitl_student()
    AND auth.uid() = added_by
  );

-- Students cannot update or delete songs — server actions only.


-- ═══════════════════════════════════════════════════════════════════════════════
-- playback_state
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Playback: authenticated students can read" ON public.playback_state;
CREATE POLICY "Playback: authenticated students can read"
  ON public.playback_state FOR SELECT
  USING (public.is_iiitl_student());

-- Only service role (server) can update playback_state.


-- ═══════════════════════════════════════════════════════════════════════════════
-- reactions
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Reactions: authenticated students can read all" ON public.reactions;
CREATE POLICY "Reactions: authenticated students can read all"
  ON public.reactions FOR SELECT
  USING (public.is_iiitl_student());

DROP POLICY IF EXISTS "Reactions: authenticated students can add" ON public.reactions;
CREATE POLICY "Reactions: authenticated students can add"
  ON public.reactions FOR INSERT
  WITH CHECK (
    public.is_iiitl_student()
    AND auth.uid() = user_id
  );

DROP POLICY IF EXISTS "Reactions: users can delete own reactions" ON public.reactions;
CREATE POLICY "Reactions: users can delete own reactions"
  ON public.reactions FOR DELETE
  USING (auth.uid() = user_id AND public.is_iiitl_student());


-- ═══════════════════════════════════════════════════════════════════════════════
-- skip_votes
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "SkipVotes: authenticated students can read" ON public.skip_votes;
CREATE POLICY "SkipVotes: authenticated students can read"
  ON public.skip_votes FOR SELECT
  USING (public.is_iiitl_student());

DROP POLICY IF EXISTS "SkipVotes: authenticated students can vote" ON public.skip_votes;
CREATE POLICY "SkipVotes: authenticated students can vote"
  ON public.skip_votes FOR INSERT
  WITH CHECK (
    public.is_iiitl_student()
    AND auth.uid() = user_id
  );

DROP POLICY IF EXISTS "SkipVotes: users can remove own vote" ON public.skip_votes;
CREATE POLICY "SkipVotes: users can remove own vote"
  ON public.skip_votes FOR DELETE
  USING (auth.uid() = user_id AND public.is_iiitl_student());


-- ═══════════════════════════════════════════════════════════════════════════════
-- daily_stats
-- ═══════════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Stats: authenticated students can read" ON public.daily_stats;
CREATE POLICY "Stats: authenticated students can read"
  ON public.daily_stats FOR SELECT
  USING (public.is_iiitl_student());

-- Stats are written server-side only.


-- ─── Enable Realtime for relevant tables ─────────────────────────────────────
-- Run these in the Supabase Dashboard → Database → Replication
-- Or run here (requires superuser):
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.playback_state;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.songs;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.skip_votes;
