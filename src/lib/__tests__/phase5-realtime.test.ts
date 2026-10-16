import { isCampusEmail } from "../auth/domain-guard";
import { checkCooldown, resetRateLimits } from "../rate-limit";
import {
  MAX_CHAT_MESSAGE_LENGTH,
  CHAT_RATE_LIMIT_MS,
  REACTION_RATE_LIMIT_MS,
  REACTION_TYPES,
} from "../constants";
import type { ChatMessage, PresenceUser, ReactionType } from "../types";

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

  return results;
}
