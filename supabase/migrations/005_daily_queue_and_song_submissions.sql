-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 005_daily_queue_and_song_submissions.sql
-- IIITL FM — Atomic submission function, queue helpers, and relationships
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Foreign key relationship for PostgREST joins ──────────────────────────
-- Connects songs.added_by to public.profiles.id for effortless profile expansion
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_songs_profiles'
  ) THEN
    ALTER TABLE public.songs
      ADD CONSTRAINT fk_songs_profiles
      FOREIGN KEY (added_by) REFERENCES public.profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;


-- ─── 2. Atomic Function: get_or_create_daily_queue ────────────────────────────
-- Idempotently returns the UUID for a given IST date's queue.
CREATE OR REPLACE FUNCTION public.get_or_create_daily_queue(p_date DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id UUID;
BEGIN
  SELECT id INTO v_queue_id
  FROM public.daily_queues
  WHERE queue_date = p_date;

  IF v_queue_id IS NULL THEN
    INSERT INTO public.daily_queues (queue_date, status)
    VALUES (p_date, 'active')
    ON CONFLICT (queue_date) DO UPDATE
      SET status = EXCLUDED.status
    RETURNING id INTO v_queue_id;
  END IF;

  RETURN v_queue_id;
END;
$$;


-- ─── 3. Atomic Function: submit_song_for_today ────────────────────────────────
-- Validates caller, enforces IST date, guarantees single submission per student,
-- prevents duplicate videos in queue, calculates position, and inserts song.
CREATE OR REPLACE FUNCTION public.submit_song_for_today(
  p_video_id TEXT,
  p_title TEXT,
  p_artist TEXT,
  p_thumbnail_url TEXT,
  p_mood_tag mood_tag,
  p_message TEXT,
  p_duration_seconds INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_today DATE;
  v_queue_id UUID;
  v_next_pos INTEGER;
  v_new_song public.songs;
  v_existing_user_song UUID;
  v_existing_video_song UUID;
BEGIN
  -- 1. Verify caller authentication and campus student status
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR NOT public.is_iiitl_student() THEN
    RAISE EXCEPTION 'Unauthorized: Only verified @iiitl.ac.in students can submit songs.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validate YouTube video ID format (11 chars alphanumeric + _ -)
  IF p_video_id IS NULL OR NOT (p_video_id ~ '^[a-zA-Z0-9_\-]{11}$') THEN
    RAISE EXCEPTION 'Invalid YouTube video ID.'
      USING ERRCODE = '22023';
  END IF;

  -- 3. Determine current IST date (Asia/Kolkata)
  v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE;

  -- 4. Get or create today's queue
  v_queue_id := public.get_or_create_daily_queue(v_today);

  -- 5. Check if user already submitted a song to today's queue
  SELECT id INTO v_existing_user_song
  FROM public.songs
  WHERE queue_id = v_queue_id AND added_by = v_user_id
  LIMIT 1;

  IF v_existing_user_song IS NOT NULL THEN
    RAISE EXCEPTION 'You have already submitted a song for today. Each student can submit one song per day.'
      USING ERRCODE = '23505';
  END IF;

  -- 6. Check if video already exists in today's queue
  SELECT id INTO v_existing_video_song
  FROM public.songs
  WHERE queue_id = v_queue_id AND video_id = p_video_id
  LIMIT 1;

  IF v_existing_video_song IS NOT NULL THEN
    RAISE EXCEPTION 'This song has already been submitted to today''s queue by another student.'
      USING ERRCODE = '23505';
  END IF;

  -- 7. Calculate next queue position
  SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_pos
  FROM public.songs
  WHERE queue_id = v_queue_id;

  -- 8. Insert new song into queue
  INSERT INTO public.songs (
    queue_id,
    video_id,
    title,
    artist,
    thumbnail_url,
    added_by,
    mood_tag,
    message,
    position,
    duration_seconds,
    status
  ) VALUES (
    v_queue_id,
    p_video_id,
    p_title,
    p_artist,
    p_thumbnail_url,
    v_user_id,
    p_mood_tag,
    CASE WHEN char_length(p_message) > 0 THEN p_message ELSE NULL END,
    v_next_pos,
    p_duration_seconds,
    'queued'
  )
  RETURNING * INTO v_new_song;

  RETURN to_jsonb(v_new_song);
END;
$$;


-- ─── 4. Grant execute permissions to authenticated students ─────────────────
GRANT EXECUTE ON FUNCTION public.get_or_create_daily_queue(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_song_for_today(TEXT, TEXT, TEXT, TEXT, mood_tag, TEXT, INTEGER) TO authenticated;
