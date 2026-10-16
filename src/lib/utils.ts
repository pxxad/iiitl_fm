import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";
import { toZonedTime } from "date-fns-tz";

/** Merge Tailwind classes safely, resolving conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** India Standard Time timezone string. */
export const IST_TIMEZONE = "Asia/Kolkata";

/** Return the current date in IST as a YYYY-MM-DD string (used for daily queue keys). */
export function todayInIST(): string {
  const now = new Date();
  const ist = toZonedTime(now, IST_TIMEZONE);
  return format(ist, "yyyy-MM-dd");
}

/** Format a UTC ISO string to a human-readable IST time string. */
export function formatIST(isoString: string, fmt = "dd MMM yyyy, hh:mm a"): string {
  const date = new Date(isoString);
  const ist = toZonedTime(date, IST_TIMEZONE);
  return format(ist, fmt);
}

/** Relative time string, e.g. "3 minutes ago". */
export function relativeTime(isoString: string): string {
  return formatDistanceToNow(new Date(isoString), { addSuffix: true });
}

/** Format seconds into mm:ss */
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Extract a YouTube video ID from common URL formats. Returns null if invalid. */
export function extractYouTubeVideoId(url: string): string | null {
  try {
    const cleaned = url.trim();
    // youtu.be/VIDEO_ID
    const shortMatch = cleaned.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortMatch) return shortMatch[1];
    // youtube.com/watch?v=VIDEO_ID or embed/VIDEO_ID or shorts/VIDEO_ID
    const longMatch = cleaned.match(
      /youtube\.com\/(?:watch\?v=|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/
    );
    if (longMatch) return longMatch[1];
    return null;
  } catch {
    return null;
  }
}

/** Validate that a string is a safe YouTube video ID (11 alphanumeric chars). */
export function isValidYouTubeVideoId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{11}$/.test(id);
}
