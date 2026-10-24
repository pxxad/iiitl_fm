/**
 * Shared TypeScript types for IIITL FM.
 * These mirror the Supabase database schema exactly.
 * Keep in sync with supabase/migrations/.
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type SongStatus = "queued" | "playing" | "played" | "skipped" | "unavailable";

export type PlaybackStatus = "idle" | "playing" | "paused" | "ended";

export type QueueStatus = "pending" | "active" | "archived";

export type MoodTag = "happy" | "chill" | "study" | "gym" | "rain" | "late_night";

export type UserRole = "student" | "moderator" | "admin";

export type ReactionType = "fire" | "heart" | "cry" | "vibe" | "skip_this";

export type ReportReason =
  | "offensive_content"
  | "hate_speech"
  | "copyright"
  | "spam"
  | "harassment"
  | "other";

// ─── Database Row Types ────────────────────────────────────────────────────────

export interface Profile {
  id: string; // References auth.users
  full_name: string | null;
  avatar_url: string | null;
  branch: string | null;
  batch: string | null;
  role?: UserRole;
  created_at: string;
}

export interface DailyQueue {
  id: string;
  queue_date: string; // YYYY-MM-DD in IST
  status: QueueStatus;
  created_at: string;
}

export interface Song {
  id: string;
  queue_id: string;
  video_id: string;
  title: string;
  artist: string | null;
  thumbnail_url: string | null;
  added_by: string; // References auth.users
  mood_tag: MoodTag | null;
  message: string | null;
  position: number;
  duration_seconds: number | null;
  status: SongStatus;
  is_hidden?: boolean;
  created_at: string;
  started_at: string | null;
}

export interface PlaybackState {
  id: string; // Always a single row with id = 'singleton'
  current_song_id: string | null;
  playback_status: PlaybackStatus;
  started_at: string | null;
  position_at_update: number; // Seconds from start of song
  updated_at: string;
  revision: number; // Monotonically increasing; used to detect stale updates
}

export interface Reaction {
  id: string;
  song_id: string;
  user_id: string;
  reaction_type: ReactionType;
  created_at: string;
}

export interface SkipVote {
  song_id: string;
  user_id: string;
  created_at: string;
}

export interface DailyStats {
  queue_date: string;
  total_submissions: number;
  dominant_mood: MoodTag | null;
  top_artist: string | null;
}

export interface Report {
  id: string;
  reporter_id: string;
  target_type: "song" | "chat_message";
  target_id: string;
  reason: ReportReason;
  details: string | null;
  status: "pending" | "reviewed" | "actioned" | "dismissed";
  created_at: string;
}

export interface ModerationAction {
  id: string;
  moderator_id: string;
  action_type: "hide_chat" | "skip_song" | "dismiss_report";
  target_type: "song" | "chat_message";
  target_id: string;
  reason: string;
  created_at: string;
}

export interface SkipVoteResult {
  song_id: string;
  voted: boolean;
  total_votes: number;
  threshold: number;
  advanced: boolean;
  error?: string;
  message?: string;
}

// ─── Extended / joined types ──────────────────────────────────────────────────

/** Song joined with the submitter's profile. */
export interface SongWithProfile extends Song {
  profiles: Pick<Profile, "full_name" | "avatar_url" | "branch" | "batch"> | null;
}

/** Reaction counts per type for a song. */
export type ReactionCounts = Partial<Record<ReactionType, number>>;

/** Live chat message stored in the database. */
export interface ChatMessage {
  id: string;
  user_id: string;
  content: string;
  is_hidden?: boolean;
  created_at: string;
  profiles?: Pick<Profile, "full_name" | "avatar_url" | "branch" | "batch"> | null;
}

/** Realtime room presence state for an active listener. */
export interface PresenceUser {
  user_id: string | null;
  display_name: string;
  branch: string | null;
  avatar_url: string | null;
  is_guest: boolean;
  joined_at: string;
}

// ─── API response wrappers ────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  data: T;
  error: null;
}

export interface ApiError {
  data: null;
  error: {
    code: string;
    message: string;
  };
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;

