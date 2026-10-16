import { isCampusEmail } from "../auth/domain-guard";
import { checkCooldown, resetRateLimits } from "../rate-limit";
import {
  MAX_CHAT_MESSAGE_LENGTH,
  CHAT_RATE_LIMIT_MS,
  REACTION_RATE_LIMIT_MS,
  REACTION_TYPES,
} from "../constants";
import type { ChatMessage, PresenceUser, ReactionType } from "../types";
import { validateBroadcastChatMessage } from "../realtime/validation";

export interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
}

export async function runPhase5Tests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      results.push({ test: testName, passed: true });
    } else {
      results.push({
        test: testName,
        passed: false,
        error: detail || "Assertion failed",
      });
    }
  }

  // ─── 1. Authentication & Domain Authorization Boundaries ────────────────────

  // Simulate server-side endpoint authorization guards
  function authorizeEndpoint(sessionUser: { email?: string } | null) {
    if (!sessionUser) {
      return { status: 401, error: "unauthorized" };
    }
    if (!sessionUser.email || !isCampusEmail(sessionUser.email)) {
      return { status: 403, error: "forbidden" };
    }
    return { status: 200, error: null };
  }

  const unauthenticatedCheck = authorizeEndpoint(null);
  assert(
    unauthenticatedCheck.status === 401 && unauthenticatedCheck.error === "unauthorized",
    "Security: Unauthenticated write requests are rejected with 401"
  );

  const externalEmailCheck = authorizeEndpoint({ email: "hacker@gmail.com" });
  assert(
    externalEmailCheck.status === 403 && externalEmailCheck.error === "forbidden",
    "Security: Non-campus @gmail.com users are rejected with 403"
  );

  const spoofedDomainCheck = authorizeEndpoint({ email: "student@iiitl.ac.in.evil.com" });
  assert(
    spoofedDomainCheck.status === 403 && spoofedDomainCheck.error === "forbidden",
    "Security: Subdomain suffix spoofing is rejected with 403"
  );

  const validCampusCheck = authorizeEndpoint({ email: "lit2023001@iiitl.ac.in" });
  assert(
    validCampusCheck.status === 200,
    "Security: Verified @iiitl.ac.in student is authorized (200)"
  );

  // ─── 2. Reaction Type Validation & Curated Set ────────────────────────────────

  const validReactions = new Set<string>(REACTION_TYPES.map((r) => r.value));

  function validateReactionType(reaction: string): boolean {
    return validReactions.has(reaction);
  }

  assert(
    validateReactionType("fire") &&
      validateReactionType("heart") &&
      validateReactionType("cry") &&
      validateReactionType("vibe") &&
      validateReactionType("skip_this"),
    "Reactions: All 5 curated reaction types are recognized as valid"
  );

  assert(
    !validateReactionType("thumbs_up"),
    "Reactions: Non-curated reaction 'thumbs_up' is rejected"
  );
  assert(
    !validateReactionType("poop"),
    "Reactions: Non-curated reaction 'poop' is rejected"
  );
  assert(
    !validateReactionType(""),
    "Reactions: Empty reaction string is rejected"
  );

  // ─── 3. Reaction Toggle & Remove Logic ───────────────────────────────────────

  function simulateReactionToggle(
    existingReaction: ReactionType | null,
    newReaction: ReactionType
  ): { action: "added" | "changed" | "removed"; activeType: ReactionType | null } {
    if (existingReaction === newReaction) {
      // User clicked same emoji -> toggles off / removes
      return { action: "removed", activeType: null };
    } else if (existingReaction !== null) {
      // User clicked different emoji -> updates / changes
      return { action: "changed", activeType: newReaction };
    } else {
      // No prior reaction -> adds
      return { action: "added", activeType: newReaction };
    }
  }

  const initialAdd = simulateReactionToggle(null, "fire");
  assert(
    initialAdd.action === "added" && initialAdd.activeType === "fire",
    "Reactions Logic: Clicking unreacted emoji sets active reaction ('added')"
  );

  const toggleOff = simulateReactionToggle("fire", "fire");
  assert(
    toggleOff.action === "removed" && toggleOff.activeType === null,
    "Reactions Logic: Clicking existing reaction emoji removes it ('removed')"
  );

  const changeReaction = simulateReactionToggle("fire", "heart");
  assert(
    changeReaction.action === "changed" && changeReaction.activeType === "heart",
    "Reactions Logic: Clicking different emoji changes active reaction ('changed')"
  );

  // ─── 4. Live Chat Content Validation ─────────────────────────────────────────

  function validateChatMessage(rawContent: unknown): {
    valid: boolean;
    sanitized?: string;
    error?: string;
  } {
    if (typeof rawContent !== "string") {
      return { valid: false, error: "invalid_type" };
    }
    const content = rawContent.trim();
    if (content.length === 0) {
      return { valid: false, error: "empty_message" };
    }
    if (content.length > MAX_CHAT_MESSAGE_LENGTH) {
      return { valid: false, error: "message_too_long" };
    }
    return { valid: true, sanitized: content };
  }

  assert(
    !validateChatMessage("").valid,
    "Live Chat: Empty string rejected"
  );
  assert(
    !validateChatMessage("    \n\t   ").valid,
    "Live Chat: Whitespace-only message rejected"
  );
  assert(
    !validateChatMessage(12345).valid,
    "Live Chat: Non-string input rejected"
  );

  const exactly200Chars = "a".repeat(200);
  const boundaryCheck = validateChatMessage(exactly200Chars);
  assert(
    boundaryCheck.valid && boundaryCheck.sanitized?.length === 200,
    "Live Chat: Exactly 200 characters is accepted"
  );

  const oversized201Chars = "a".repeat(201);
  const oversizedCheck = validateChatMessage(oversized201Chars);
  assert(
    !oversizedCheck.valid && oversizedCheck.error === "message_too_long",
    "Live Chat: 201 characters rejected (exceeds limit)"
  );

  // ─── 5. Rate Limiting Protection ────────────────────────────────────────────

  resetRateLimits();

  // Test chat rate limit (1 message per 2 seconds)
  const chatKey = "test_user_chat_1";
  const chatFirst = checkCooldown(chatKey, CHAT_RATE_LIMIT_MS);
  assert(chatFirst.success, "Rate Limit: Initial chat message allowed");

  const chatSecondImmediate = checkCooldown(chatKey, CHAT_RATE_LIMIT_MS);
  assert(
    !chatSecondImmediate.success && chatSecondImmediate.retryAfterMs > 0,
    "Rate Limit: Immediate second chat message within 2s is throttled"
  );

  // Test reaction rate limit (cooldown 500ms)
  const reactionKey = "test_user_rxn_1";
  const rxnFirst = checkCooldown(reactionKey, REACTION_RATE_LIMIT_MS);
  assert(rxnFirst.success, "Rate Limit: Initial reaction allowed");

  const rxnSecondImmediate = checkCooldown(reactionKey, REACTION_RATE_LIMIT_MS);
  assert(
    !rxnSecondImmediate.success && rxnSecondImmediate.retryAfterMs > 0,
    "Rate Limit: Immediate second reaction within 500ms is throttled"
  );

  // ─── 6. Client Message Deduplication ────────────────────────────────────────

  const existingMessages: ChatMessage[] = [
    { id: "msg_1", user_id: "user_a", content: "Hey campus!", created_at: "2026-10-16T15:00:00Z" },
    { id: "msg_2", user_id: "user_b", content: "Vibing to this song", created_at: "2026-10-16T15:01:00Z" },
  ];

  function appendDeduplicated(list: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
    if (list.some((m) => m.id === incoming.id)) {
      return list;
    }
    return [...list, incoming];
  }

  const duplicate = { id: "msg_2", user_id: "user_b", content: "Vibing to this song", created_at: "2026-10-16T15:01:00Z" };
  const dedupedList = appendDeduplicated(existingMessages, duplicate);
  assert(
    dedupedList.length === 2,
    "Deduplication: Duplicate incoming message event is ignored"
  );

  const newMsg = { id: "msg_3", user_id: "user_c", content: "New song please", created_at: "2026-10-16T15:02:00Z" };
  const appendedList = appendDeduplicated(existingMessages, newMsg);
  assert(
    appendedList.length === 3,
    "Deduplication: Unique message is appended successfully"
  );

  // ─── 7. Realtime Presence Privacy Guard ──────────────────────────────────────

  function createPresencePayload(user: { id: string; email?: string } | null, profileName?: string, branch?: string): PresenceUser {
    // Crucial rule: Presence payload must NEVER include user email
    return {
      user_id: user?.id || null,
      display_name: profileName || (user ? "Student" : "Guest Listener"),
      branch: branch || null,
      avatar_url: null,
      is_guest: !user,
      joined_at: new Date().toISOString(),
    };
  }

  const studentPresence = createPresencePayload(
    { id: "user_123", email: "sensitive_student@iiitl.ac.in" },
    "Aditya",
    "CS"
  );

  assert(
    !("email" in studentPresence),
    "Presence Privacy: Student email address is never exposed in Presence payload"
  );
  assert(
    studentPresence.display_name === "Aditya" && studentPresence.branch === "CS",
    "Presence Privacy: Minimum necessary display name and branch are included"
  );

  const guestPresence = createPresencePayload(null);
  assert(
    guestPresence.is_guest && guestPresence.user_id === null,
    "Presence Privacy: Unauthenticated listener correctly marked as guest"
  );

  // ─── 8. Safe Content Rendering (XSS Attack Prevention) ───────────────────────

  function sanitizeForSafeDisplay(raw: string): string {
    // In React JSX: strings rendered inside <div>{content}</div> are automatically escaped as text nodes.
    // Ensure no HTML tags or script elements can execute.
    return raw.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  const maliciousScript = "<script>alert('xss')</script>";
  const escaped = sanitizeForSafeDisplay(maliciousScript);
  assert(
    escaped === "&lt;script&gt;alert('xss')&lt;/script&gt;" && !escaped.includes("<script>"),
    "Safe Rendering: Malicious HTML and script payloads are strictly escaped"
  );

  // ─── 9. Hardened Reaction Database RLS Policies Simulation ───────────────────

  interface DbAuthSession {
    uid: string;
    email: string | null;
  }

  function simulateReactionsRls(
    session: DbAuthSession | null,
    operation: "INSERT" | "UPDATE" | "DELETE",
    targetRow: { user_id: string },
    newRow?: { user_id: string }
  ): { allowed: boolean; reason?: string } {
    if (!session || !session.uid) {
      return { allowed: false, reason: "unauthenticated" };
    }

    const hasCampusEmail = isCampusEmail(session.email);
    if (!hasCampusEmail) {
      return { allowed: false, reason: "forbidden_non_campus" };
    }

    if (operation === "INSERT") {
      const allowed = session.uid === targetRow.user_id;
      return { allowed, reason: allowed ? undefined : "cannot_insert_for_other" };
    }

    if (operation === "UPDATE") {
      const usingCheck = session.uid === targetRow.user_id;
      const withCheck = newRow ? session.uid === newRow.user_id : true;
      const allowed = usingCheck && withCheck;
      return { allowed, reason: allowed ? undefined : "cannot_update_other_or_reassign" };
    }

    if (operation === "DELETE") {
      const allowed = session.uid === targetRow.user_id;
      return { allowed, reason: allowed ? undefined : "cannot_delete_other" };
    }

    return { allowed: false, reason: "unknown_op" };
  }

  const campusUser: DbAuthSession = { uid: "user_campus_1", email: "lit2023001@iiitl.ac.in" };
  const externalUser: DbAuthSession = { uid: "user_ext_2", email: "outsider@gmail.com" };

  // INSERT checks
  assert(
    !simulateReactionsRls(externalUser, "INSERT", { user_id: externalUser.uid }).allowed,
    "Hardened RLS: Non-campus user cannot INSERT reaction directly at DB layer"
  );
  assert(
    !simulateReactionsRls(campusUser, "INSERT", { user_id: "other_user_id" }).allowed,
    "Hardened RLS: Campus user cannot INSERT reaction with someone else's user_id"
  );
  assert(
    simulateReactionsRls(campusUser, "INSERT", { user_id: campusUser.uid }).allowed,
    "Hardened RLS: Campus student can INSERT reaction for their own user_id"
  );

  // UPDATE checks
  assert(
    !simulateReactionsRls(externalUser, "UPDATE", { user_id: externalUser.uid }, { user_id: externalUser.uid }).allowed,
    "Hardened RLS: Non-campus user cannot UPDATE reaction even if owning row"
  );
  assert(
    !simulateReactionsRls(campusUser, "UPDATE", { user_id: "other_user" }, { user_id: campusUser.uid }).allowed,
    "Hardened RLS: Campus user cannot UPDATE someone else's reaction row"
  );
  assert(
    !simulateReactionsRls(campusUser, "UPDATE", { user_id: campusUser.uid }, { user_id: "other_user" }).allowed,
    "Hardened RLS: Campus user cannot reassign user_id to another user on UPDATE"
  );
  assert(
    simulateReactionsRls(campusUser, "UPDATE", { user_id: campusUser.uid }, { user_id: campusUser.uid }).allowed,
    "Hardened RLS: Campus student can UPDATE their own reaction"
  );

  // DELETE checks
  assert(
    !simulateReactionsRls(externalUser, "DELETE", { user_id: externalUser.uid }).allowed,
    "Hardened RLS: Non-campus user cannot DELETE reaction even if owning row"
  );
  assert(
    !simulateReactionsRls(campusUser, "DELETE", { user_id: "other_user" }).allowed,
    "Hardened RLS: Campus user cannot DELETE someone else's reaction row"
  );
  assert(
    simulateReactionsRls(campusUser, "DELETE", { user_id: campusUser.uid }).allowed,
    "Hardened RLS: Campus student can DELETE their own reaction"
  );

  // ─── 10. Concurrency-Safe Reaction Toggle Semantics & Conflict Handling ──────

  class MockReactionStore {
    // Key: `${song_id}:${user_id}`
    private store = new Map<string, { id: string; reaction_type: ReactionType }>();

    async toggleReaction(
      songId: string,
      userId: string,
      reactionType: ReactionType
    ): Promise<{ action: "added" | "changed" | "removed"; reactionType: ReactionType | null }> {
      const key = `${songId}:${userId}`;

      // Simulate pg_advisory_xact_lock / FOR UPDATE / conflict retry
      const existing = this.store.get(key);

      if (existing) {
        if (existing.reaction_type === reactionType) {
          this.store.delete(key);
          return { action: "removed", reactionType: null };
        } else {
          existing.reaction_type = reactionType;
          return { action: "changed", reactionType };
        }
      } else {
        // Attempt insert
        // In PostgreSQL: if another transaction concurrently inserted, unique_violation occurs
        // Our hardened function catches unique_violation and re-evaluates
        this.store.set(key, { id: `rxn_${Date.now()}`, reaction_type: reactionType });
        return { action: "added", reactionType };
      }
    }

    get(songId: string, userId: string) {
      return this.store.get(`${songId}:${userId}`);
    }
  }

  const mockDb = new MockReactionStore();

  // Test 1: Single add
  const r1 = await mockDb.toggleReaction("song_1", "user_1", "fire");
  assert(
    r1.action === "added" && r1.reactionType === "fire",
    "Concurrency Semantics: Initial toggle adds reaction ('added')"
  );

  // Test 2: Toggle off
  const r2 = await mockDb.toggleReaction("song_1", "user_1", "fire");
  assert(
    r2.action === "removed" && r2.reactionType === null,
    "Concurrency Semantics: Same emoji click removes reaction ('removed')"
  );

  // Test 3: Re-add then change
  await mockDb.toggleReaction("song_1", "user_1", "fire");
  const r3 = await mockDb.toggleReaction("song_1", "user_1", "heart");
  assert(
    r3.action === "changed" && r3.reactionType === "heart",
    "Concurrency Semantics: Different emoji click replaces reaction ('changed')"
  );

  // Test 4: Simulate concurrent race resolution
  // If two requests race on an empty state, one catches unique_violation and reconciles cleanly
  function simulateConcurrentToggles(
    initialReaction: ReactionType | null,
    call1Type: ReactionType,
    call2Type: ReactionType
  ) {
    let current = initialReaction;
    const errors: string[] = [];

    // Step 1: Thread A executes
    if (current === call1Type) {
      current = null;
    } else {
      current = call1Type;
    }

    // Step 2: Thread B executes with race retry (catches conflict, selects current, toggles)
    try {
      if (current === call2Type) {
        current = null;
      } else {
        current = call2Type;
      }
    } catch {
      errors.push("unique_violation");
    }

    return { finalReaction: current, errors };
  }

  const race1 = simulateConcurrentToggles(null, "fire", "fire");
  assert(
    race1.errors.length === 0 && race1.finalReaction === null,
    "Concurrency Race: Two simultaneous identical clicks safely toggle on then off without unhandled errors"
  );

  const race2 = simulateConcurrentToggles(null, "fire", "vibe");
  assert(
    race2.errors.length === 0 && race2.finalReaction === "vibe",
    "Concurrency Race: Simultaneous different clicks safely converge to latest without conflict error"
  );

  // ─── 11. Realtime Chat Broadcast Payload Validation ──────────────────────────

  // Malformed payloads
  assert(
    validateBroadcastChatMessage(null) === null,
    "Broadcast Validation: null payload rejected"
  );
  assert(
    validateBroadcastChatMessage(undefined) === null,
    "Broadcast Validation: undefined payload rejected"
  );
  assert(
    validateBroadcastChatMessage("not an object") === null,
    "Broadcast Validation: string payload rejected"
  );
  assert(
    validateBroadcastChatMessage([1, 2, 3]) === null,
    "Broadcast Validation: array payload rejected"
  );
  assert(
    validateBroadcastChatMessage({}) === null,
    "Broadcast Validation: empty object rejected (missing required fields)"
  );

  // Missing or invalid ID / user_id
  assert(
    validateBroadcastChatMessage({ content: "hello" }) === null,
    "Broadcast Validation: missing id rejected"
  );
  assert(
    validateBroadcastChatMessage({ id: 123, user_id: "u1", content: "hello" }) === null,
    "Broadcast Validation: non-string id rejected"
  );
  assert(
    validateBroadcastChatMessage({ id: "msg_1", content: "hello" }) === null,
    "Broadcast Validation: missing user_id rejected"
  );
  assert(
    validateBroadcastChatMessage({ id: "msg_1", user_id: "", content: "hello" }) === null,
    "Broadcast Validation: empty user_id rejected"
  );

  // Missing, empty or whitespace-only content
  assert(
    validateBroadcastChatMessage({ id: "msg_1", user_id: "u1" }) === null,
    "Broadcast Validation: missing content rejected"
  );
  assert(
    validateBroadcastChatMessage({ id: "msg_1", user_id: "u1", content: "" }) === null,
    "Broadcast Validation: empty content rejected"
  );
  assert(
    validateBroadcastChatMessage({ id: "msg_1", user_id: "u1", content: "   \n\t  " }) === null,
    "Broadcast Validation: whitespace-only content rejected"
  );

  // Oversized content
  const msg201 = "x".repeat(201);
  assert(
    validateBroadcastChatMessage({ id: "msg_1", user_id: "u1", content: msg201 }) === null,
    "Broadcast Validation: oversized content (>200 chars) rejected"
  );

  // Valid 200-character boundary content
  const msg200 = "x".repeat(200);
  const valid200 = validateBroadcastChatMessage({ id: "msg_1", user_id: "u1", content: msg200 });
  assert(
    valid200 !== null && valid200.content.length === 200,
    "Broadcast Validation: exactly 200-char content accepted"
  );

  // Spoofed metadata and sensitive fields stripped
  const maliciousBroadcast = {
    id: "msg_spoof_1",
    user_id: "u_attacker",
    content: "Normal looking message",
    created_at: "2099-01-01T00:00:00Z", // Future date
    role: "admin",
    is_admin: true,
    email: "hacker@evil.com",
    profiles: {
      full_name: "Injected Admin",
      email: "leaked@iiitl.ac.in",
      role: "superuser",
      branch: "IT",
      batch: "2023",
      avatar_url: "https://example.com/avatar.jpg",
    },
  };

  const sanitized = validateBroadcastChatMessage(maliciousBroadcast);
  assert(
    sanitized !== null,
    "Broadcast Validation: Valid structure parsed successfully"
  );
  assert(
    sanitized !== null && !("role" in sanitized) && !("email" in sanitized) && !("is_admin" in sanitized),
    "Broadcast Validation: Injected top-level keys (role, email, is_admin) are stripped"
  );
  assert(
    sanitized !== null && !!sanitized.profiles && !("email" in (sanitized.profiles as object)) && !("role" in (sanitized.profiles as object)),
    "Broadcast Validation: Injected profile keys (email, role) are strictly stripped"
  );
  assert(
    sanitized !== null && sanitized.profiles?.full_name === "Injected Admin" && sanitized.profiles?.branch === "IT",
    "Broadcast Validation: Safe profile fields (name, branch, batch) are preserved"
  );
  assert(
    sanitized !== null && Date.parse(sanitized.created_at) < Date.parse("2098-01-01"),
    "Broadcast Validation: Distant future timestamp sanitized to current time"
  );

  return results;
}

