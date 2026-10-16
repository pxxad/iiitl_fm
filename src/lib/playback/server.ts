import { createClient } from "@/lib/supabase/server";
import { todayInIST } from "@/lib/utils";
import type { AuthoritativePlaybackState, ActiveSongDetails } from "./sync";

/**
 * Retrieves the current authoritative playback state and currently playing song.
 */
export async function getAuthoritativePlaybackState(): Promise<AuthoritativePlaybackState> {
  const supabase = await createClient();

  // Try atomic RPC function first
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc(
      "get_current_playback_details"
    );

    if (!rpcError && rpcData) {
      return rpcData as AuthoritativePlaybackState;
    }
  } catch (err) {
    console.warn("[Playback Engine] RPC get_current_playback_details error, using query fallback:", err);
  }

  // Direct query fallback path
  const { data: state } = await supabase
    .from("playback_state")
    .select("*")
    .eq("id", "singleton")
    .single();

  if (!state) {
    return {
      current_song_id: null,
      playback_status: "idle",
      started_at: null,
      position_at_update: 0,
      revision: 0,
      updated_at: new Date().toISOString(),
      song: null,
    };
  }

  let activeSong: ActiveSongDetails | null = null;
  if (state.current_song_id) {
    const { data: songData } = await supabase
      .from("songs")
      .select(`
        *,
        profiles:added_by (
          full_name,
          avatar_url,
          branch,
          batch
        )
      `)
      .eq("id", state.current_song_id)
      .single();

    if (songData) {
      activeSong = songData as ActiveSongDetails;
    }
  }

  return {
    current_song_id: state.current_song_id,
    playback_status: state.playback_status,
    started_at: state.started_at,
    position_at_update: state.position_at_update || 0,
    revision: state.revision || 0,
    updated_at: state.updated_at,
    song: activeSong,
  };
}

export interface AdvanceQueueResult {
  advanced: boolean;
  status: "playing" | "idle";
  reason?: string;
  song?: ActiveSongDetails | null;
  revision: number;
}

/**
 * Idempotently advances the daily playback queue to the next song.
 * Uses atomic RPC when available, with a query-level fallback.
 */
export async function advancePlaybackQueue(
  expectedSongId?: string | null,
  reason: "ended" | "skipped" | "unavailable" = "ended"
): Promise<AdvanceQueueResult> {
  const supabase = await createClient();

  // 1. Try atomic database RPC function (Migration 007)
  try {
    const { data, error } = await supabase.rpc("advance_playback_queue", {
      p_expected_song_id: expectedSongId || null,
      p_reason: reason,
    });

    if (!error && data) {
      return data as AdvanceQueueResult;
    }

    if (error && error.code !== "42883") {
      console.error("[Playback Engine] Advance RPC failed:", error);
      throw new Error(error.message);
    }
  } catch (rpcErr) {
    console.warn("[Playback Engine] RPC advance exception, attempting fallback:", rpcErr);
  }

  // 2. Direct query fallback
  const { data: state, error: stateError } = await supabase
    .from("playback_state")
    .select("*")
    .eq("id", "singleton")
    .single();

  if (stateError || !state) {
    throw new Error("Playback state singleton not initialized.");
  }

  // Idempotency check: if client sent an expectedSongId, but server is already on a different song, do not double-advance
  if (expectedSongId && state.current_song_id && state.current_song_id !== expectedSongId) {
    return {
      advanced: false,
      status: state.playback_status === "playing" ? "playing" : "idle",
      reason: "stale_request",
      revision: state.revision,
    };
  }

  // Mark current song as played / skipped / unavailable
  if (state.current_song_id) {
    await supabase
      .from("songs")
      .update({ status: reason === "skipped" ? "skipped" : reason === "unavailable" ? "unavailable" : "played" })
      .eq("id", state.current_song_id);
  }

  // Find next queued song in today's active queue
  const todayIST = todayInIST();
  const { data: dailyQueue } = await supabase
    .from("daily_queues")
    .select("id")
    .eq("queue_date", todayIST)
    .single();

  let nextSong: ActiveSongDetails | null = null;
  if (dailyQueue) {
    const { data: candidateSong } = await supabase
      .from("songs")
      .select(`
        *,
        profiles:added_by (
          full_name,
          avatar_url,
          branch,
          batch
        )
      `)
      .eq("queue_id", dailyQueue.id)
      .eq("status", "queued")
      .order("position", { ascending: true })
      .limit(1)
      .single();

    if (candidateSong) {
      nextSong = candidateSong as ActiveSongDetails;
    }
  }

  const newRevision = (state.revision || 0) + 1;
  const nowIso = new Date().toISOString();

  if (nextSong) {
    // Mark next song as playing
    await supabase
      .from("songs")
      .update({ status: "playing", started_at: nowIso })
      .eq("id", nextSong.id);

    // Update singleton
    await supabase
      .from("playback_state")
      .update({
        current_song_id: nextSong.id,
        playback_status: "playing",
        started_at: nowIso,
        position_at_update: 0,
        revision: newRevision,
        updated_at: nowIso,
      })
      .eq("id", "singleton");

    return {
      advanced: true,
      status: "playing",
      song: nextSong,
      revision: newRevision,
    };
  } else {
    // Queue ended / idle
    await supabase
      .from("playback_state")
      .update({
        current_song_id: null,
        playback_status: "idle",
        started_at: null,
        position_at_update: 0,
        revision: newRevision,
        updated_at: nowIso,
      })
      .eq("id", "singleton");

    return {
      advanced: true,
      status: "idle",
      song: null,
      revision: newRevision,
    };
  }
}
