-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 011_ensure_profile_on_submission.sql
-- IIITL FM — Defensive profile creation on song submission (fk_songs_profiles)
-- ─────────────────────────────────────────────────────────────────────────────

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
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_user_id UUID;
  v_today DATE;
  v_queue_id UUID;
  v_song_count INTEGER;
  v_next_pos INTEGER;
  v_new_song public.songs;
  v_existing_user_song UUID;
  v_existing_video_song UUID;
BEGIN
  -- 1. Authorization: Verify caller is an authenticated @iiitl.ac.in student
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR NOT public.is_iiitl_student() THEN
    RAISE EXCEPTION 'Unauthorized: Only verified @iiitl.ac.in students can submit songs.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Validation: Strict 11-char YouTube ID format
  IF p_video_id IS NULL OR NOT (p_video_id ~ '^[a-zA-Z0-9_\-]{11}$') THEN
    RAISE EXCEPTION 'Invalid YouTube video ID.'
      USING ERRCODE = '22023';
  END IF;

  -- 2.5. Profile Integrity Guard (satisfy fk_songs_profiles)
  -- If profile row was not created at registration, auto-create it now from auth.users
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
    INSERT INTO public.profiles (id, full_name, avatar_url)
    SELECT
      u.id,
      COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name'),
      COALESCE(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
    FROM auth.users u
    WHERE u.id = v_user_id
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 3. Date Authority: Server clock in Asia/Kolkata
  v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE;

  -- 4. Get or create today's queue
  v_queue_id := public.get_or_create_daily_queue(v_today);

  -- 5. Concurrency Serialization: Lock daily_queues row to serialize queue positioning
  PERFORM id
  FROM public.daily_queues
  WHERE id = v_queue_id
  FOR UPDATE;

  -- 6. Enforce Queue Capacity Limit (Max 50 songs per day)
  SELECT COUNT(*) INTO v_song_count
  FROM public.songs
  WHERE queue_id = v_queue_id;

  IF v_song_count >= 50 THEN
    RAISE EXCEPTION 'Today''s queue is full (maximum 50 songs reached). Submissions reopen tomorrow at 12:00 AM IST.'
      USING ERRCODE = '54000';
  END IF;

  -- 7. Check if caller already submitted to today's queue
  SELECT id INTO v_existing_user_song
  FROM public.songs
  WHERE queue_id = v_queue_id AND added_by = v_user_id
  LIMIT 1;

  IF v_existing_user_song IS NOT NULL THEN
    RAISE EXCEPTION 'You have already submitted a song for today. Each student can submit one song per calendar day.'
      USING ERRCODE = '23505';
  END IF;

  -- 8. Check if video already exists in today's queue
  SELECT id INTO v_existing_video_song
  FROM public.songs
  WHERE queue_id = v_queue_id AND video_id = p_video_id
  LIMIT 1;

  IF v_existing_video_song IS NOT NULL THEN
    RAISE EXCEPTION 'This song has already been submitted to today''s queue by another student.'
      USING ERRCODE = '23505';
  END IF;

  -- 9. Determine consecutive queue position safely under row lock
  SELECT COALESCE(MAX(position), 0) + 1 INTO v_next_pos
  FROM public.songs
  WHERE queue_id = v_queue_id;

  -- 10. Insert song
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

REVOKE ALL ON FUNCTION public.submit_song_for_today(TEXT, TEXT, TEXT, TEXT, mood_tag, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_song_for_today(TEXT, TEXT, TEXT, TEXT, mood_tag, TEXT, INTEGER) TO authenticated;
