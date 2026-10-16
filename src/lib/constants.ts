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
