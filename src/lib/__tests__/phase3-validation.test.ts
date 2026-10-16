import { extractYouTubeId } from "../youtube";
import { todayInIST } from "../utils";
import { isCampusEmail } from "../auth/domain-guard";
import { MOOD_TAGS, MAX_MESSAGE_LENGTH } from "../constants";

export function runPhase3Tests() {
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

  // ─── 6. Duplicate & One-Per-Day Simulation ────────────────────────────────
  type MockSubmission = {
    userId: string;
    videoId: string;
    date: string;
  };

  const queue: MockSubmission[] = [];

  function simulateSubmit(sub: MockSubmission): { ok: boolean; reason?: string } {
    if (!isCampusEmail(sub.userId)) {
      return { ok: false, reason: "Unauthorized domain" };
    }
    const userAlreadySubmitted = queue.some(
      (s) => s.userId === sub.userId && s.date === sub.date
    );
    if (userAlreadySubmitted) {
      return { ok: false, reason: "Duplicate user submission for date" };
    }
    const videoAlreadyQueued = queue.some(
      (s) => s.videoId === sub.videoId && s.date === sub.date
    );
    if (videoAlreadyQueued) {
      return { ok: false, reason: "Duplicate video in queue for date" };
    }
    queue.push(sub);
    return { ok: true };
  }

  // Student 1 submits Video A on Date 1
  const sub1 = simulateSubmit({
    userId: "lit2023001@iiitl.ac.in",
    videoId: "dQw4w9WgXcQ",
    date: istDate,
  });
  assert(sub1.ok, "Student 1 submits Video A successfully");

  // Student 1 attempts repeat submission on same Date 1 -> REJECT
  const sub1Repeat = simulateSubmit({
    userId: "lit2023001@iiitl.ac.in",
    videoId: "differentId1",
    date: istDate,
  });
  assert(
    !sub1Repeat.ok && sub1Repeat.reason === "Duplicate user submission for date",
    "Repeat submission by Student 1 rejected on same day"
  );

  // Student 2 attempts to queue same Video A on Date 1 -> REJECT
  const sub2DuplicateVideo = simulateSubmit({
    userId: "bcs2024012@iiitl.ac.in",
    videoId: "dQw4w9WgXcQ",
    date: istDate,
  });
  assert(
    !sub2DuplicateVideo.ok && sub2DuplicateVideo.reason === "Duplicate video in queue for date",
    "Duplicate video rejected within same daily queue"
  );

  // Student 2 queues Video B on Date 1 -> ALLOW
  const sub2 = simulateSubmit({
    userId: "bcs2024012@iiitl.ac.in",
    videoId: "differentId2",
    date: istDate,
  });
  assert(sub2.ok, "Student 2 submits Video B successfully");

  // Non-campus student attempts submission -> REJECT
  const subNonCampus = simulateSubmit({
    userId: "stranger@gmail.com",
    videoId: "differentId3",
    date: istDate,
  });
  assert(
    !subNonCampus.ok && subNonCampus.reason === "Unauthorized domain",
    "Non-campus email submission rejected"
  );

  return results;
}
