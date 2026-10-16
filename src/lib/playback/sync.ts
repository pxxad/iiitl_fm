import type { PlaybackStatus, Song, Profile } from "@/lib/types";

export interface ActiveSongDetails extends Song {
  submitter_name?: string | null;
  submitter_avatar?: string | null;
  submitter_branch?: string | null;
  profiles?: Pick<Profile, "full_name" | "avatar_url" | "branch" | "batch"> | null;
}

export interface AuthoritativePlaybackState {
  current_song_id: string | null;
  playback_status: PlaybackStatus;
  started_at: string | null;
  position_at_update: number;
  revision: number;
  updated_at: string;
  song: ActiveSongDetails | null;
}

/**
 * Calculates the expected playback position in seconds based on server authoritative time.
 * Note: YouTube playback synchronization is bounded by browser buffering and network variance.
 */
export function calculateExpectedPosition(
  startedAtIso: string | null | undefined,
  positionAtUpdate = 0,
  status: PlaybackStatus = "idle",
  durationSeconds?: number | null
): number {
  if (status !== "playing" || !startedAtIso) {
    return Math.max(0, positionAtUpdate);
  }

  const startTimeMs = new Date(startedAtIso).getTime();
  if (isNaN(startTimeMs)) {
    return Math.max(0, positionAtUpdate);
  }

  const nowMs = Date.now();
  const elapsedSeconds = Math.max(0, (nowMs - startTimeMs) / 1000);
  const calculated = positionAtUpdate + elapsedSeconds;

  if (durationSeconds && durationSeconds > 0 && calculated > durationSeconds) {
    return durationSeconds;
  }

  return calculated;
}

export type DriftAction = "none" | "smooth_seek" | "hard_seek";

export interface DriftEvaluation {
  driftSeconds: number;
  action: DriftAction;
  targetSeconds: number;
}

/**
 * Compares current player time against server expected time.
 * Avoids micro-seeks under 1.5s to preserve continuous audio without buffering stutters.
 */
export function evaluateDrift(
  actualSeconds: number,
  expectedSeconds: number
): DriftEvaluation {
  const driftSeconds = actualSeconds - expectedSeconds;
  const absDrift = Math.abs(driftSeconds);

  if (absDrift <= 1.5) {
    return { driftSeconds, action: "none", targetSeconds: expectedSeconds };
  }

  if (absDrift <= 4.0) {
    return { driftSeconds, action: "smooth_seek", targetSeconds: expectedSeconds };
  }

  return { driftSeconds, action: "hard_seek", targetSeconds: expectedSeconds };
}
