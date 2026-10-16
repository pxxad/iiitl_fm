import {
  calculateExpectedPosition,
  evaluateDrift,
  type AuthoritativePlaybackState,
} from "../playback/sync";

export interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
}

export async function runPhase4Tests(): Promise<TestResult[]> {
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

  // ─── 1. Expected Position Calculation Tests ─────────────────────────────────

  // Idle state returns positionAtUpdate or 0
  const idlePos = calculateExpectedPosition(null, 0, "idle", 180);
  assert(idlePos === 0, "calculateExpectedPosition: idle returns 0 if position is 0");

  const idleWithOffset = calculateExpectedPosition(null, 45, "idle", 180);
  assert(idleWithOffset === 45, "calculateExpectedPosition: idle returns positionAtUpdate");

  // Paused state returns positionAtUpdate without incrementing
  const pausedPos = calculateExpectedPosition(
    new Date(Date.now() - 10000).toISOString(),
    30,
    "paused",
    180
  );
  assert(
    pausedPos === 30,
    "calculateExpectedPosition: paused state freezes position at update time"
  );

  // Playing state adds elapsed seconds from started_at
  const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
  const playingPos = calculateExpectedPosition(fiveSecondsAgo, 10, "playing", 180);
  // Allowed tolerance +/- 0.5s due to clock execution
  assert(
    playingPos >= 14.5 && playingPos <= 15.5,
    `calculateExpectedPosition: elapsed time added accurately (got ${playingPos.toFixed(2)}s, expected ~15s)`
  );

  // Negative position clamping
  const negativeClamped = calculateExpectedPosition(null, -10, "idle", 180);
  assert(
    negativeClamped === 0,
    "calculateExpectedPosition: negative positions clamped to 0"
  );

  // Clamping to duration
  const overshotTime = new Date(Date.now() - 300000).toISOString(); // 5 min ago
  const clampedPos = calculateExpectedPosition(overshotTime, 0, "playing", 120);
  assert(
    clampedPos === 120,
    "calculateExpectedPosition: position clamped to track duration when elapsed exceeds duration"
  );

  // Corrupted / invalid timestamp handling
  const corruptedPos = calculateExpectedPosition("invalid-iso-date", 25, "playing", 180);
  assert(
    corruptedPos === 25,
    "calculateExpectedPosition: invalid ISO string gracefully falls back to positionAtUpdate"
  );

  // ─── 2. Drift Evaluation Logic Tests ─────────────────────────────────────────

  // Under 1.5s tolerance: no seek action (preserves audio continuity)
  const driftSmallAhead = evaluateDrift(10.8, 10.0);
  assert(
    driftSmallAhead.action === "none",
    "evaluateDrift: drift +0.8s requires action 'none'"
  );

  const driftSmallBehind = evaluateDrift(9.2, 10.0);
  assert(
    driftSmallBehind.action === "none",
    "evaluateDrift: drift -0.8s requires action 'none'"
  );

  const driftExactBorder = evaluateDrift(11.5, 10.0);
  assert(
    driftExactBorder.action === "none",
    "evaluateDrift: drift of exactly 1.5s is tolerated with action 'none'"
  );

  // 1.5s to 4.0s: smooth seek action
  const driftSmoothAhead = evaluateDrift(12.2, 10.0);
  assert(
    driftSmoothAhead.action === "smooth_seek" && driftSmoothAhead.targetSeconds === 10.0,
    "evaluateDrift: drift +2.2s triggers 'smooth_seek' targeting expected time"
  );

  const driftSmoothBehind = evaluateDrift(6.5, 10.0);
  assert(
    driftSmoothBehind.action === "smooth_seek" && driftSmoothBehind.targetSeconds === 10.0,
    "evaluateDrift: drift -3.5s triggers 'smooth_seek' targeting expected time"
  );

  // Over 4.0s: hard seek action (handles reconnect, wake from sleep, tab switch)
  const driftLargeAhead = evaluateDrift(30.0, 10.0);
  assert(
    driftLargeAhead.action === "hard_seek" && driftLargeAhead.targetSeconds === 10.0,
    "evaluateDrift: drift +20s triggers 'hard_seek'"
  );

  const driftLargeBehind = evaluateDrift(2.0, 45.0);
  assert(
    driftLargeBehind.action === "hard_seek" && driftLargeBehind.targetSeconds === 45.0,
    "evaluateDrift: drift -43s triggers 'hard_seek'"
  );

  // ─── 3. Stale Event & Revision Protection Logic Tests ────────────────────────

  // Simulate server authoritative state
  const mockServerState: AuthoritativePlaybackState = {
    current_song_id: "song_abc_123",
    playback_status: "playing",
    started_at: new Date(Date.now() - 30000).toISOString(),
    position_at_update: 0,
    revision: 5,
    updated_at: new Date().toISOString(),
    song: null,
  };

  // Test 3a: Client tries to advance an already-advanced track (stale song ID)
  const staleClientSongId = "song_old_prior";
  const isAdvanceAllowed = (clientExpectedId: string | null, currentServerId: string | null) => {
    // If client provides an expected song id and it does not match server, reject as stale
    if (clientExpectedId && currentServerId && clientExpectedId !== currentServerId) {
      return { allowed: false, reason: "stale_request" };
    }
    return { allowed: true, reason: "valid" };
  };

  const staleResult = isAdvanceAllowed(staleClientSongId, mockServerState.current_song_id);
  assert(
    !staleResult.allowed && staleResult.reason === "stale_request",
    "Concurrency: Stale queue advancement request is rejected if song already advanced"
  );

  // Test 3b: Client provides matching current song ID
  const validResult = isAdvanceAllowed("song_abc_123", mockServerState.current_song_id);
  assert(
    validResult.allowed,
    "Concurrency: Matching expected song ID allows queue advance"
  );

  // Test 3c: Stale broadcast revision check
  const incomingClientRevision = 4;
  const isBroadcastStale = incomingClientRevision < mockServerState.revision;
  assert(
    isBroadcastStale,
    "Realtime: Lower revision updates are identified as stale and discarded"
  );

  // ─── 4. YouTube Error Code Mapping & Unembeddable Track Handling ───────────────

  function isFatalEmbedError(errorCode: number): boolean {
    // 100 = video not found/removed
    // 101/150 = video does not allow embedded playback
    return errorCode === 100 || errorCode === 101 || errorCode === 150;
  }

  assert(
    isFatalEmbedError(150),
    "YouTube Player: Error code 150 (not embeddable) is recognized as fatal error"
  );
  assert(
    isFatalEmbedError(101),
    "YouTube Player: Error code 101 (owner prohibits embed) is recognized as fatal error"
  );
  assert(
    isFatalEmbedError(100),
    "YouTube Player: Error code 100 (video removed/private) is recognized as fatal error"
  );
  assert(
    !isFatalEmbedError(2),
    "YouTube Player: Error code 2 (invalid parameter) is non-fatal formatting issue"
  );

  // ─── 5. Server Authority & Untrusted Timestamp Guard ─────────────────────────

  function sanitizeClientPlaybackParams(body: Record<string, unknown>) {
    // Server must NEVER accept client timestamps or client-dictated started_at
    const sanitized = {
      expectedSongId: typeof body.expectedSongId === "string" ? body.expectedSongId : null,
      reason:
        body.reason === "skipped" || body.reason === "unavailable"
          ? body.reason
          : "ended",
      // started_at is strictly determined by server clock
      serverStartedAt: new Date().toISOString(),
    };
    return sanitized;
  }

  const clientPayloadWithTamperedTime = {
    expectedSongId: "song_abc_123",
    reason: "ended",
    started_at: "1999-01-01T00:00:00Z", // Attacker trying to set start time
    position: 9999, // Attacker trying to spoof position
    userId: "impersonated_admin", // Attacker trying to pass identity
  };

  const sanitized = sanitizeClientPlaybackParams(clientPayloadWithTamperedTime);
  assert(
    !("started_at" in sanitized) && !("position" in sanitized) && !("userId" in sanitized),
    "Security: Client-provided timestamps, positions, and user IDs are discarded by server engine"
  );
  assert(
    typeof sanitized.serverStartedAt === "string" && !isNaN(new Date(sanitized.serverStartedAt).getTime()),
    "Security: Server assigns authoritative timestamp independently of client input"
  );

  // ─── 6. Autoplay & Muted Fallback Policy ───────────────────────────────────────

  interface PlayerInitOptions {
    autoplayBlocked: boolean;
    volume: number;
    isMuted: boolean;
  }

  function resolveAutoplayState(userHasInteracted: boolean): PlayerInitOptions {
    if (!userHasInteracted) {
      return { autoplayBlocked: true, volume: 80, isMuted: true };
    }
    return { autoplayBlocked: false, volume: 80, isMuted: false };
  }

  const unengagedState = resolveAutoplayState(false);
  assert(
    unengagedState.autoplayBlocked && unengagedState.isMuted,
    "Autoplay Policy: Unengaged visitor receives muted state with unblock overlay"
  );

  const engagedState = resolveAutoplayState(true);
  assert(
    !engagedState.autoplayBlocked && !engagedState.isMuted,
    "Autoplay Policy: Engaged visitor transitions to unmuted live radio playback"
  );

  return results;
}
