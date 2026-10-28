/**
 * IIITL FM — Constants
 * Centralised application-level constants. Import from here, not hardcoded.
 */

/** Allowed email domain for IIITL students. */
export const ALLOWED_EMAIL_DOMAIN = "iiitl.ac.in" as const;

/** India Standard Time IANA timezone string. */
export const IST_TIMEZONE = "Asia/Kolkata" as const;

/** Maximum characters allowed in a song submission message. */
export const MAX_MESSAGE_LENGTH = 280;

/** Maximum songs allowed in a single daily queue. */
export const MAX_SONGS_PER_QUEUE = 50;

/** Maximum songs an individual student can submit per IST calendar day. */
export const MAX_SONGS_PER_STUDENT_PER_DAY = 5;

/** Number of skip votes required to skip a song (as a fraction of listeners). */
export const SKIP_THRESHOLD_FRACTION = 0.5; // 50% of active listeners

/** Minimum listeners required before skip-vote threshold applies. */
export const SKIP_MIN_LISTENERS = 3;

/** Mood tags available for song submission, in display order. */
export const MOOD_TAGS = [
  { value: "happy",      label: "Happy",      emoji: "😄" },
  { value: "chill",      label: "Chill",      emoji: "🌊" },
  { value: "study",      label: "Study",      emoji: "📚" },
  { value: "gym",        label: "Gym",        emoji: "💪" },
  { value: "rain",       label: "Rain",       emoji: "🌧️" },
  { value: "late_night", label: "Late Night", emoji: "🌙" },
] as const;

/** Reaction types available. */
export const REACTION_TYPES = [
  { value: "fire",      label: "Fire",     emoji: "🔥" },
  { value: "heart",     label: "Love",     emoji: "❤️" },
  { value: "cry",       label: "Emotional",emoji: "😭" },
  { value: "vibe",      label: "Vibe",     emoji: "✨" },
  { value: "skip_this", label: "Skip",     emoji: "⏭️" },
] as const;

/** Supabase Realtime channel name for the shared live room. */
export const LIVE_ROOM_CHANNEL = "iiitl-fm-live-room" as const;

/** Supabase Realtime channel for playback state changes. */
export const PLAYBACK_CHANNEL = "playback-state" as const;

/** Maximum length of a single live chat message. */
export const MAX_CHAT_MESSAGE_LENGTH = 200;

/** Minimum milliseconds between chat messages per user (rate limit). */
export const CHAT_RATE_LIMIT_MS = 2000;

/** Minimum milliseconds between reaction actions per user (rate limit). */
export const REACTION_RATE_LIMIT_MS = 500;

/** Default number of recent chat messages loaded on initial connection. */
export const DEFAULT_CHAT_HISTORY_LIMIT = 50;

/** Fixed number of verified campus skip votes required to automatically advance a track. */
export const SKIP_VOTE_THRESHOLD = 3;

/** Curated report reasons for community moderation. */
export const REPORT_REASONS = [
  { value: "offensive_content", label: "Offensive or NSFW Content" },
  { value: "hate_speech",       label: "Hate Speech or Harassment" },
  { value: "copyright",         label: "Copyright Infringement" },
  { value: "spam",              label: "Spam or Advertising" },
  { value: "harassment",        label: "Targeted Harassment" },
  { value: "other",             label: "Other Campus Guideline Violation" },
] as const;

/** Maximum reports a user can submit within a 5-minute rolling window. */
export const MAX_REPORTS_PER_WINDOW = 3;
export const REPORT_WINDOW_MS = 300_000;

