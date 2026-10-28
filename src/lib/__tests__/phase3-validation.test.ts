import { extractYouTubeId } from "../youtube";
import { todayInIST } from "../utils";
import { isCampusEmail } from "../auth/domain-guard";
import { MOOD_TAGS, MAX_MESSAGE_LENGTH, MAX_SONGS_PER_QUEUE } from "../constants";

export async function runPhase3Tests() {
  const results: Array<{ test: string; passed: boolean; error?: string }> = [];

  function assert(condition: boolean, testName: string) {
    if (condition) {
      results.push({ test: testName, passed: true });
    } else {
      results.push({ test: testName, passed: false, error: "Assertion failed" });
    }
  }

  // ─── 1. YouTube Extraction Tests ──────────────────────────────────────────
  assert(
    extractYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ") === "dQw4w9WgXcQ",
    "Extract from standard youtube.com/watch?v= URL"
  );
  assert(
    extractYouTubeId("https://youtu.be/dQw4w9WgXcQ") === "dQw4w9WgXcQ",
    "Extract from short youtu.be/ URL"
  );
  assert(
    extractYouTubeId("https://youtube.com/shorts/dQw4w9WgXcQ?feature=share") === "dQw4w9WgXcQ",
    "Extract from youtube.com/shorts/ URL with query params"
  );
  assert(
    extractYouTubeId("https://www.youtube.com/embed/dQw4w9WgXcQ") === "dQw4w9WgXcQ",
    "Extract from youtube.com/embed/ URL"
  );
  assert(
    extractYouTubeId("dQw4w9WgXcQ") === "dQw4w9WgXcQ",
    "Extract from bare 11-char ID"
  );
  assert(
    extractYouTubeId("https://vimeo.com/123456789") === null,
    "Reject non-YouTube video URL"
  );
  assert(
    extractYouTubeId("https://youtube.com/watch?v=invalid_short") === null,
    "Reject short invalid ID length"
  );
  assert(
    extractYouTubeId("not-a-valid-url") === null,
    "Reject arbitrary non-URL text"
  );
  assert(
    extractYouTubeId("") === null,
    "Reject empty input"
  );

  // ─── 2. IST Calendar Date Tests ───────────────────────────────────────────
  const istDate = todayInIST();
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(istDate),
    `todayInIST() format is YYYY-MM-DD (got ${istDate})`
  );

  // ─── 3. Campus Authorization Tests ────────────────────────────────────────
  assert(
    isCampusEmail("lit2023001@iiitl.ac.in") === true,
    "Authorize valid student @iiitl.ac.in"
  );
  assert(
    isCampusEmail("faculty@iiitl.ac.in") === true,
    "Authorize faculty @iiitl.ac.in"
  );
  assert(
    isCampusEmail("attacker@gmail.com") === false,
    "Reject external @gmail.com"
  );
  assert(
    isCampusEmail("attacker@fake-iiitl.ac.in") === false,
    "Reject lookalike @fake-iiitl.ac.in"
  );
  assert(
    isCampusEmail("attacker@iiitl.ac.in.evil.com") === false,
    "Reject suffix subdomain @iiitl.ac.in.evil.com"
  );
  assert(
    isCampusEmail("attacker@subdomain.iiitl.ac.in") === false,
    "Reject unauthorized subdomains"
  );

  // ─── 4. Mood Tag Constraints ──────────────────────────────────────────────
  const validTags = MOOD_TAGS.map((m) => m.value) as string[];
  assert(validTags.includes("chill"), "Mood tags include 'chill'");
  assert(validTags.includes("gym"), "Mood tags include 'gym'");
  assert(validTags.includes("study"), "Mood tags include 'study'");
  assert(!validTags.includes("invalid_mood"), "Reject unknown mood tag");

  // ─── 5. Message Length Constraints ────────────────────────────────────────
  assert(MAX_MESSAGE_LENGTH === 280, "MAX_MESSAGE_LENGTH is exactly 280 characters");
  assert(MAX_SONGS_PER_QUEUE === 50, "MAX_SONGS_PER_QUEUE is exactly 50 songs");

  // ─── 6. Concurrency & Queue Invariants Simulation ─────────────────────────
  type QueuedSong = {
    id: string;
    userId: string;
    videoId: string;
    position: number;
    date: string;
  };

  class ConcurrentQueueSimulator {
    private songs: QueuedSong[] = [];
    private lock = false;

    // Simulates Postgres row-lock transaction behavior
    async submit(userId: string, videoId: string, date: string): Promise<{ ok: boolean; reason?: string; position?: number }> {
      // Simulate random microsecond latency before transaction acquires lock
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 5));

      // Acquire lock on daily queue row (FOR UPDATE)
      while (this.lock) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      this.lock = true;

      try {
        if (!isCampusEmail(userId)) {
          return { ok: false, reason: "Unauthorized domain" };
        }

        // Capacity check
        if (this.songs.length >= MAX_SONGS_PER_QUEUE) {
          return { ok: false, reason: "Queue is full" };
        }

        // Per-student daily limit check (Max 5 per student per day)
        const userCount = this.songs.filter(
          (s) => s.userId === userId && s.date === date
        ).length;
        if (userCount >= 5) {
          return { ok: false, reason: "User reached daily limit of 5 submissions" };
        }

        // Duplicate video check
        if (this.songs.some((s) => s.videoId === videoId && s.date === date)) {
          return { ok: false, reason: "Duplicate video in queue" };
        }

        // Atomic position assignment
        const position = this.songs.length + 1;
        this.songs.push({
          id: `song-${position}`,
          userId,
          videoId,
          position,
          date,
        });

        return { ok: true, position };
      } finally {
        this.lock = false;
      }
    }

    getSongs() {
      return [...this.songs];
    }
  }

  // TEST A: 10 simultaneous submissions by the SAME user with 10 different videos
  const sim1 = new ConcurrentQueueSimulator();
  const sameUserPromises = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) =>
    sim1.submit("lit2023001@iiitl.ac.in", `vid${i}1234567`, istDate)
  );
  const sameUserResults = await Promise.all(sameUserPromises);
  const sameUserSuccesses = sameUserResults.filter((r) => r.ok);
  const sameUserFailures = sameUserResults.filter((r) => !r.ok);
  assert(
    sameUserSuccesses.length === 5 && sameUserFailures.length === 5,
    "Concurrency: Exactly 5 submissions succeed for simultaneous requests by same user (limit 5)"
  );


  // TEST B: 5 simultaneous submissions of the SAME video by DIFFERENT users
  const sim2 = new ConcurrentQueueSimulator();
  const sameVideoPromises = [1, 2, 3, 4, 5].map((i) =>
    sim2.submit(`lit202300${i}@iiitl.ac.in`, "dQw4w9WgXcQ", istDate)
  );
  const sameVideoResults = await Promise.all(sameVideoPromises);
  const sameVideoSuccesses = sameVideoResults.filter((r) => r.ok);
  const sameVideoFailures = sameVideoResults.filter((r) => !r.ok);
  assert(
    sameVideoSuccesses.length === 1 && sameVideoFailures.length === 4,
    "Concurrency: Exactly 1 submission succeeds for simultaneous submissions of same video"
  );

  // TEST C: 10 concurrent submissions by 10 different students -> unique sequential positions
  const sim3 = new ConcurrentQueueSimulator();
  const concurrentPromises = Array.from({ length: 10 }, (_, i) =>
    sim3.submit(`lit20240${i.toString().padStart(2, "0")}@iiitl.ac.in`, `uniqVid${i.toString().padStart(4, "0")}`, istDate)
  );
  const concurrentResults = await Promise.all(concurrentPromises);
  const allSucceeded = concurrentResults.every((r) => r.ok);
  const positions = concurrentResults.map((r) => r.position!).sort((a, b) => a - b);
  const expectedPositions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const positionsMatch = JSON.stringify(positions) === JSON.stringify(expectedPositions);
  assert(
    allSucceeded && positionsMatch,
    "Concurrency: 10 concurrent student submissions receive strictly consecutive unique positions 1..10"
  );

  // TEST D: Queue capacity limit (50 songs maximum)
  const sim4 = new ConcurrentQueueSimulator();
  // Fill 50 songs
  for (let i = 1; i <= 50; i++) {
    await sim4.submit(`stud${i.toString().padStart(3, "0")}@iiitl.ac.in`, `vid${i.toString().padStart(8, "0")}`, istDate);
  }
  const attempt51 = await sim4.submit("stud051@iiitl.ac.in", "vid05112345", istDate);
  assert(
    !attempt51.ok && attempt51.reason === "Queue is full",
    "Capacity: 51st submission rejected when daily queue reaches MAX_SONGS_PER_QUEUE (50)"
  );

  return results;
}
