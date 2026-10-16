/**
 * In-memory sliding window and cooldown rate-limiter for server route handlers.
 * Prevents spam across reaction toggles and live chat messages.
 */

interface RateLimitRecord {
  timestamps: number[];
  lastAction: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

// Periodically clean up entries older than 60 seconds
const CLEANUP_INTERVAL_MS = 60_000;
let lastCleanup = Date.now();

function purgeExpiredEntries() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const expirationThreshold = now - 60_000;
  for (const [key, record] of rateLimitStore.entries()) {
    if (record.lastAction < expirationThreshold) {
      rateLimitStore.delete(key);
    }
  }
}

export interface RateLimitResult {
  success: boolean;
  retryAfterMs: number;
  remaining?: number;
}

/**
 * Checks if an action is allowed based on a cooldown (minimum delay between requests).
 */
export function checkCooldown(
  key: string,
  minIntervalMs: number
): RateLimitResult {
  purgeExpiredEntries();
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record) {
    rateLimitStore.set(key, { timestamps: [now], lastAction: now });
    return { success: true, retryAfterMs: 0 };
  }

  const elapsed = now - record.lastAction;
  if (elapsed < minIntervalMs) {
    const retryAfterMs = minIntervalMs - elapsed;
    return { success: false, retryAfterMs };
  }

  record.lastAction = now;
  record.timestamps.push(now);
  return { success: true, retryAfterMs: 0 };
}

/**
 * Checks if an action is allowed based on max requests within a rolling window.
 */
export function checkRollingRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  purgeExpiredEntries();
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record) {
    rateLimitStore.set(key, { timestamps: [now], lastAction: now });
    return { success: true, retryAfterMs: 0, remaining: maxRequests - 1 };
  }

  // Filter timestamps within the rolling window
  const windowStart = now - windowMs;
  record.timestamps = record.timestamps.filter((t) => t > windowStart);
  record.lastAction = now;

  if (record.timestamps.length >= maxRequests) {
    const oldestInWindow = record.timestamps[0];
    const retryAfterMs = Math.max(0, oldestInWindow + windowMs - now);
    return { success: false, retryAfterMs, remaining: 0 };
  }

  record.timestamps.push(now);
  return {
    success: true,
    retryAfterMs: 0,
    remaining: maxRequests - record.timestamps.length,
  };
}

/** Reset rate limit store (useful for unit tests). */
export function resetRateLimits() {
  rateLimitStore.clear();
}
