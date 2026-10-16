/**
 * In-memory sliding window and cooldown rate-limiter for server route handlers.
 * Prevents rapid spam across reaction toggles and live chat messages for a single instance.
 *
 * ARCHITECTURAL LIMITATION & PRODUCTION RECOMMENDATION:
 * ----------------------------------------------------
 * 1. Per-Instance Scope:
 *    This rate-limiter maintains state in a local Node.js process Map (`rateLimitStore`).
 *    In multi-instance serverless deployments (such as Vercel Edge/Serverless functions,
 *    multi-region clusters, or auto-scaled containers), each cold-start instance maintains
 *    its own memory space. Requests from the same client routed to different instances
 *    or regions will not share state, making this an approximate first-line defense rather
 *    than a globally synchronized limit.
 *
 * 2. Authoritative Database Backstop:
 *    Hard security invariants must always be enforced at the database level:
 *    - `uq_one_reaction_per_user_per_song` ensures at most 1 reaction per student per song.
 *    - Strict RLS policies and atomic transaction locks prevent data tampering.
 *
 * 3. Recommended Production Scaling:
 *    For production multi-region deployments requiring strict global rate enforcement,
 *    replace this in-memory store with a shared low-latency Redis service (e.g. Upstash Redis,
 *    Redis Cloud, or AWS ElastiCache) using an atomic sliding-window script or token bucket.
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
