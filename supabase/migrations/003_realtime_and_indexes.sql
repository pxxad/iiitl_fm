-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 003_realtime_and_indexes.sql
-- IIITL FM — Realtime publication setup and additional performance indexes
--
-- Run AFTER 002_rls_policies.sql
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Enable Realtime on tables ───────────────────────────────────────────────
-- These tables need live updates pushed to connected clients.
ALTER PUBLICATION supabase_realtime ADD TABLE public.playback_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.songs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.skip_votes;


-- ─── Additional composite indexes for query patterns ─────────────────────────

-- When loading the active daily queue with its songs
CREATE INDEX IF NOT EXISTS idx_songs_queue_status
  ON public.songs(queue_id, status, position);

-- Fast daily stats lookup
CREATE INDEX IF NOT EXISTS idx_daily_stats_date
  ON public.daily_stats(queue_date DESC);

-- Reaction counts grouped by song
CREATE INDEX IF NOT EXISTS idx_reactions_song_type
  ON public.reactions(song_id, reaction_type);

-- Archive / discover page — songs ordered by most reacted
CREATE INDEX IF NOT EXISTS idx_reactions_created_at
  ON public.reactions(created_at DESC);
