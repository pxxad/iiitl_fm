-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 007_playback_engine_and_advancement.sql
-- IIITL FM — Server-authoritative playback engine, atomic queue advancement,
-- and drift sync support.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Public Read Policy on playback_state ─────────────────────────────────
-- Connected listeners (both authenticated and guests) must read live playback state
DROP POLICY IF EXISTS "Playback: authenticated students can read" ON public.playback_state;
DROP POLICY IF EXISTS "Playback: public read" ON public.playback_state;
CREATE POLICY "Playback: public read"
  ON public.playback_state FOR SELECT
  USING (true);


-- ─── 2. Atomic Function: advance_playback_queue ──────────────────────────────
-- Advances the daily queue idempotently under row-level lock.
-- Stale requests with mismatched p_expected_song_id return current state without double-advancing.
CREATE OR REPLACE FUNCTION public.advance_playback_queue(
  p_expected_song_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT 'ended'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_current_state public.playback_state;
  v_today DATE;
  v_today_queue_id UUID;
  v_next_song public.songs;
  v_song_status song_status;
  v_result JSONB;
BEGIN
  -- 1. Lock the singleton playback_state row to serialize advancements
  SELECT * INTO v_current_state
  FROM public.playback_state
  WHERE id = 'singleton'
  FOR UPDATE;

  -- 2. Idempotency Check:
  -- If client reported that song X ended, but current_song_id is already different (or NULL),
  -- another client/worker already advanced the queue. Do not double-advance.
  IF p_expected_song_id IS NOT NULL AND v_current_state.current_song_id IS NOT NULL THEN
    IF v_current_state.current_song_id <> p_expected_song_id THEN
      -- Return current state without modifying
      RETURN jsonb_build_object(
        'advanced', false,
        'reason', 'stale_request',
        'current_song_id', v_current_state.current_song_id,
        'playback_status', v_current_state.playback_status,
        'revision', v_current_state.revision
      );
    END IF;
  END IF;

  -- 3. Update the ended/skipped song status in public.songs
  IF v_current_state.current_song_id IS NOT NULL THEN
    IF p_reason = 'skipped' THEN
      v_song_status := 'skipped';
    ELSIF p_reason = 'unavailable' THEN
      v_song_status := 'unavailable';
    ELSE
      v_song_status := 'played';
    END IF;

    UPDATE public.songs
    SET status = v_song_status
    WHERE id = v_current_state.current_song_id;
  END IF;

  -- 4. Find the next queued song in today's active queue (Asia/Kolkata date)
  v_today := (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::DATE;

  SELECT id INTO v_today_queue_id
  FROM public.daily_queues
  WHERE queue_date = v_today;

  IF v_today_queue_id IS NOT NULL THEN
    SELECT * INTO v_next_song
    FROM public.songs
    WHERE queue_id = v_today_queue_id
      AND status = 'queued'
    ORDER BY position ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;
  END IF;

  -- 5. Transition to next song OR transition to idle if queue is finished
  IF v_next_song.id IS NOT NULL THEN
    -- Mark next song as playing
    UPDATE public.songs
    SET status = 'playing',
        started_at = now()
    WHERE id = v_next_song.id;

    -- Update singleton playback state
    UPDATE public.playback_state
    SET current_song_id = v_next_song.id,
        playback_status = 'playing',
        started_at = now(),
        position_at_update = 0,
        updated_at = now(),
        revision = v_current_state.revision + 1
    WHERE id = 'singleton'
    RETURNING * INTO v_current_state;

    v_result := jsonb_build_object(
      'advanced', true,
      'status', 'playing',
      'song', to_jsonb(v_next_song),
      'started_at', v_current_state.started_at,
      'revision', v_current_state.revision
    );
  ELSE
    -- Queue is empty / idle
    UPDATE public.playback_state
    SET current_song_id = NULL,
        playback_status = 'idle',
        started_at = NULL,
        position_at_update = 0,
        updated_at = now(),
        revision = v_current_state.revision + 1
    WHERE id = 'singleton'
    RETURNING * INTO v_current_state;

    v_result := jsonb_build_object(
      'advanced', true,
      'status', 'idle',
      'song', null,
      'revision', v_current_state.revision
    );
  END IF;

  RETURN v_result;
END;
$$;

-- Revoke public execution, grant to authenticated and service_role
REVOKE ALL ON FUNCTION public.advance_playback_queue(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.advance_playback_queue(UUID, TEXT) TO authenticated, service_role;


-- ─── 3. Helper: get_current_playback_details ─────────────────────────────────
-- Returns the singleton playback row joined with the active song and submitter profile.
CREATE OR REPLACE FUNCTION public.get_current_playback_details()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_catalog
AS $$
DECLARE
  v_state public.playback_state;
  v_song RECORD;
  v_result JSONB;
BEGIN
  SELECT * INTO v_state FROM public.playback_state WHERE id = 'singleton';

  IF v_state.current_song_id IS NOT NULL THEN
    SELECT
      s.*,
      p.full_name AS submitter_name,
      p.avatar_url AS submitter_avatar,
      p.branch AS submitter_branch
    INTO v_song
    FROM public.songs s
    LEFT JOIN public.profiles p ON s.added_by = p.id
    WHERE s.id = v_state.current_song_id;

    v_result := jsonb_build_object(
      'playback_status', v_state.playback_status,
      'current_song_id', v_state.current_song_id,
      'started_at', v_state.started_at,
      'position_at_update', v_state.position_at_update,
      'updated_at', v_state.updated_at,
      'revision', v_state.revision,
      'song', row_to_json(v_song)
    );
  ELSE
    v_result := jsonb_build_object(
      'playback_status', v_state.playback_status,
      'current_song_id', null,
      'started_at', null,
      'position_at_update', 0,
      'updated_at', v_state.updated_at,
      'revision', v_state.revision,
      'song', null
    );
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_current_playback_details() TO PUBLIC, authenticated, anon;
