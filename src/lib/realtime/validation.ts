import { MAX_CHAT_MESSAGE_LENGTH } from "@/lib/constants";
import type { ChatMessage, Profile } from "@/lib/types";

/**
 * Validates and sanitizes incoming realtime chat broadcast messages.
 *
 * Rules:
 * 1. Payload must be a valid non-null object.
 * 2. Message ID must be a non-empty string of bounded length.
 * 3. User ID must be a non-empty string.
 * 4. Content must be a string, non-empty after trimming, and <= 200 characters.
 * 5. Sender identity and timestamps are never trusted blindly:
 *    - Invalid or distant future/past timestamps are sanitized to the current server/client time.
 *    - Profile fields are strictly bounded, and sensitive keys (e.g. email, role) are discarded.
 * 6. Returns a sanitized ChatMessage, or null if the payload is invalid/malformed.
 */
export function validateBroadcastChatMessage(payload: unknown): ChatMessage | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const raw = payload as Record<string, unknown>;

  // 1. Validate ID
  if (typeof raw.id !== "string") {
    return null;
  }
  const id = raw.id.trim();
  if (id.length === 0 || id.length > 100) {
    return null;
  }

  // 2. Validate User ID
  if (typeof raw.user_id !== "string") {
    return null;
  }
  const userId = raw.user_id.trim();
  if (userId.length === 0 || userId.length > 100) {
    return null;
  }

  // 3. Validate Content
  if (typeof raw.content !== "string") {
    return null;
  }
  const trimmedContent = raw.content.trim();
  if (trimmedContent.length === 0) {
    return null;
  }
  if (raw.content.length > MAX_CHAT_MESSAGE_LENGTH || trimmedContent.length > MAX_CHAT_MESSAGE_LENGTH) {
    return null;
  }

  // 4. Validate / sanitize created_at timestamp
  let createdAt = new Date().toISOString();
  if (typeof raw.created_at === "string") {
    const parsedTime = Date.parse(raw.created_at);
    if (!isNaN(parsedTime)) {
      const now = Date.now();
      // Allow slight clock skew (-24h to +5m)
      const isReasonableTime = parsedTime >= now - 86_400_000 && parsedTime <= now + 300_000;
      if (isReasonableTime) {
        createdAt = new Date(parsedTime).toISOString();
      }
    }
  }

  // 5. Sanitize and bound sender profile metadata (never trust spoofed identity or email)
  let sanitizedProfile: Pick<Profile, "full_name" | "avatar_url" | "branch" | "batch"> | null = null;

  if (raw.profiles && typeof raw.profiles === "object" && !Array.isArray(raw.profiles)) {
    const rawProfile = raw.profiles as Record<string, unknown>;

    const fullName =
      typeof rawProfile.full_name === "string" && rawProfile.full_name.trim().length > 0
        ? rawProfile.full_name.trim().slice(0, 60)
        : "Campus Student";

    const avatarUrl =
      typeof rawProfile.avatar_url === "string" &&
      (rawProfile.avatar_url.startsWith("https://") || rawProfile.avatar_url.startsWith("http://")) &&
      rawProfile.avatar_url.length <= 500
        ? rawProfile.avatar_url
        : null;

    const branch =
      typeof rawProfile.branch === "string" && rawProfile.branch.trim().length > 0
        ? rawProfile.branch.trim().slice(0, 30)
        : null;

    const batch =
      typeof rawProfile.batch === "string" && rawProfile.batch.trim().length > 0
        ? rawProfile.batch.trim().slice(0, 10)
        : null;

    sanitizedProfile = {
      full_name: fullName,
      avatar_url: avatarUrl,
      branch,
      batch,
    };
  } else {
    sanitizedProfile = {
      full_name: "Campus Student",
      avatar_url: null,
      branch: null,
      batch: null,
    };
  }

  return {
    id,
    user_id: userId,
    content: trimmedContent,
    created_at: createdAt,
    profiles: sanitizedProfile,
  };
}
