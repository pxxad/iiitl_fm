-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 001_initial_schema.sql
-- IIITL FM — Complete initial database schema
--
-- Run this in:
--   Supabase Dashboard → SQL Editor → New query → Paste → Run
--
-- This migration is idempotent (uses IF NOT EXISTS / OR REPLACE).
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ─── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE song_status AS ENUM ('queued', 'playing', 'played', 'skipped', 'unavailable');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE playback_status AS ENUM ('idle', 'playing', 'paused', 'ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE queue_status AS ENUM ('pending', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE mood_tag AS ENUM ('happy', 'chill', 'study', 'gym', 'rain', 'late_night');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE reaction_type AS ENUM ('fire', 'heart', 'cry', 'vibe', 'skip_this');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ─── profiles ────────────────────────────────────────────────────────────────
-- Mirrors auth.users; created automatically on first login via trigger.
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  avatar_url  TEXT,
  branch      TEXT,
  batch       TEXT,               -- e.g. '2023', '2024'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for quick profile lookups
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.profiles(id);


-- ─── daily_queues ─────────────────────────────────────────────────────────────
-- One row per calendar day (IST). Ensures only one active queue at a time.
CREATE TABLE IF NOT EXISTS public.daily_queues (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_date  DATE NOT NULL UNIQUE,   -- IST date, enforces one queue per day
  status      queue_status NOT NULL DEFAULT 'pending',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_queues_date   ON public.daily_queues(queue_date DESC);
CREATE INDEX IF NOT EXISTS idx_daily_queues_status ON public.daily_queues(status);


-- ─── songs ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.songs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id         UUID NOT NULL REFERENCES public.daily_queues(id) ON DELETE RESTRICT,
  video_id         TEXT NOT NULL,                -- YouTube video ID (11 chars)
  title            TEXT NOT NULL,
  artist           TEXT,
  thumbnail_url    TEXT,
  added_by         UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  mood_tag         mood_tag,
  message          TEXT CHECK (char_length(message) <= 280),
  position         INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER CHECK (duration_seconds > 0),
  status           song_status NOT NULL DEFAULT 'queued',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at       TIMESTAMPTZ,

  -- A student can only submit one song per queue
  CONSTRAINT uq_one_submission_per_user_per_queue UNIQUE (queue_id, added_by),
  -- No duplicate videos in the same daily queue
  CONSTRAINT uq_unique_video_per_queue UNIQUE (queue_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_songs_queue_id  ON public.songs(queue_id);
CREATE INDEX IF NOT EXISTS idx_songs_added_by  ON public.songs(added_by);
CREATE INDEX IF NOT EXISTS idx_songs_status    ON public.songs(status);
CREATE INDEX IF NOT EXISTS idx_songs_position  ON public.songs(queue_id, position);
CREATE INDEX IF NOT EXISTS idx_songs_video_id  ON public.songs(video_id);

-- Validate YouTube video_id format
ALTER TABLE public.songs
  DROP CONSTRAINT IF EXISTS chk_valid_video_id,
  ADD CONSTRAINT chk_valid_video_id
    CHECK (video_id ~ '^[a-zA-Z0-9_\-]{11}$');


-- ─── playback_state ──────────────────────────────────────────────────────────
-- Singleton row — always id = 'singleton'.
-- Server is the sole writer; clients read via Realtime.
CREATE TABLE IF NOT EXISTS public.playback_state (
  id                TEXT PRIMARY KEY DEFAULT 'singleton'
                    CHECK (id = 'singleton'),
  current_song_id   UUID REFERENCES public.songs(id) ON DELETE SET NULL,
  playback_status   playback_status NOT NULL DEFAULT 'idle',
  started_at        TIMESTAMPTZ,
  position_at_update FLOAT NOT NULL DEFAULT 0,   -- seconds
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  revision          BIGINT NOT NULL DEFAULT 0    -- incremented on every update
);

-- Seed the singleton row so we never need an INSERT from app code.
INSERT INTO public.playback_state (id) VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;


-- ─── reactions ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  song_id       UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reaction_type reaction_type NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One reaction per type per user per song
  CONSTRAINT uq_one_reaction_per_type UNIQUE (song_id, user_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_reactions_song_id  ON public.reactions(song_id);
CREATE INDEX IF NOT EXISTS idx_reactions_user_id  ON public.reactions(user_id);


-- ─── skip_votes ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.skip_votes (
  song_id    UUID NOT NULL REFERENCES public.songs(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (song_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_skip_votes_song_id ON public.skip_votes(song_id);


-- ─── daily_stats ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_stats (
  queue_date         DATE PRIMARY KEY,
  total_submissions  INTEGER NOT NULL DEFAULT 0,
  dominant_mood      mood_tag,
  top_artist         TEXT
);


-- ─── Trigger: auto-create profile on new user ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ─── Trigger: update playback_state.updated_at automatically ─────────────────
CREATE OR REPLACE FUNCTION public.update_playback_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  NEW.revision   = OLD.revision + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_playback_state_update ON public.playback_state;
CREATE TRIGGER on_playback_state_update
  BEFORE UPDATE ON public.playback_state
  FOR EACH ROW EXECUTE FUNCTION public.update_playback_timestamp();
