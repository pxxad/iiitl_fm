import {
  MAX_SONGS_PER_QUEUE,
  MAX_SONGS_PER_STUDENT_PER_DAY,
} from "@/lib/constants";
import { isCampusEmail } from "@/lib/auth/domain-guard";

export interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
}

interface QueuedSong {
  id: string;
  queueId: string;
  userId: string;
  videoId: string;
  position: number;
  date: string; // IST date YYYY-MM-DD
}

/**
 * Simulator modeling the authoritative submit_song_for_today RPC from migration 012.
 * Serializes requests using daily queue row lock, enforces 50-song queue cap,
 * 5-song per-student per-IST-day cap, campus domain check, and duplicate video rejection.
 */
class AuthoritativeSubmissionEngine {
  private songs: QueuedSong[] = [];
  private rowLock = false;

  async submit(
    userEmail: string,
    videoId: string,
    istDate: string
  ): Promise<{
    ok: boolean;
    status: number;
    error?: string;
    song?: QueuedSong;
    remainingSubmissions?: number;
  }> {
    // Latency jitter simulating concurrent network calls
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 4));

    // Acquire daily_queues row lock (FOR UPDATE)
    while (this.rowLock) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    this.rowLock = true;

    try {
      // 1. Authorization: Verify caller is an authenticated @iiitl.ac.in student
      if (!isCampusEmail(userEmail)) {
        return {
          ok: false,
          status: 403,
          error: "Unauthorized: Only verified @iiitl.ac.in students can submit songs.",
        };
      }

      // 2. Validation: Strict 11-char YouTube ID format
      if (!videoId || !/^[a-zA-Z0-9_\-]{11}$/.test(videoId)) {
        return {
          ok: false,
          status: 400,
          error: "Invalid YouTube video ID.",
        };
      }

      // 3. Queue Capacity Limit (Max 50 songs per day)
      const queueSongs = this.songs.filter((s) => s.date === istDate);
      if (queueSongs.length >= MAX_SONGS_PER_QUEUE) {
        return {
          ok: false,
          status: 409,
          error: "Today's queue is full (maximum 50 songs reached). Submissions reopen tomorrow at 12:00 AM IST.",
        };
      }

      // 4. Per-student daily limit (Max 5 songs per student per IST calendar day)
      const userTodayCount = queueSongs.filter((s) => s.userId === userEmail).length;
      if (userTodayCount >= MAX_SONGS_PER_STUDENT_PER_DAY) {
        return {
          ok: false,
          status: 409,
          error: "You have reached your daily limit of 5 song submissions for today. Submissions reopen tomorrow at 12:00 AM IST.",
        };
      }

      // 5. Duplicate Video Check: Ensure video is not already in today's queue
      if (queueSongs.some((s) => s.videoId === videoId)) {
        return {
          ok: false,
          status: 409,
          error: "This song has already been submitted to today's queue by another student.",
        };
      }

      // 6. Sequential positioning
      const position = queueSongs.length + 1;
      const newSong: QueuedSong = {
        id: `song-${istDate}-${position}`,
        queueId: `queue-${istDate}`,
        userId: userEmail,
        videoId,
        position,
        date: istDate,
      };
      this.songs.push(newSong);

      const remaining = Math.max(
        0,
        MAX_SONGS_PER_STUDENT_PER_DAY - (userTodayCount + 1)
      );

      return {
        ok: true,
        status: 200,
        song: newSong,
        remainingSubmissions: remaining,
      };
    } finally {
      this.rowLock = false;
    }
  }

  getStudentSubmissions(userId: string, istDate: string): QueuedSong[] {
    return this.songs.filter((s) => s.userId === userId && s.date === istDate);
  }

  getRemainingSubmissions(userId: string, istDate: string): number {
    const count = this.getStudentSubmissions(userId, istDate).length;
    return Math.max(0, MAX_SONGS_PER_STUDENT_PER_DAY - count);
  }
}

export async function runDailyLimitTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const assert = (condition: unknown, test: string, error?: string) => {
    results.push({ test, passed: Boolean(condition), error: condition ? undefined : error });
  };


  const today = "2026-10-28";
  const tomorrow = "2026-10-29";
  const student1 = "lit2023001@iiitl.ac.in";
  const student2 = "bcs2023045@iiitl.ac.in";
  const nonCampusUser = "attacker@gmail.com";

  // 1. First through fifth submissions succeed
  const engine = new AuthoritativeSubmissionEngine();
  const sub1 = await engine.submit(student1, "aaaaaaaaaaa", today);
  const sub2 = await engine.submit(student1, "bbbbbbbbbbb", today);
  const sub3 = await engine.submit(student1, "ccccccccccc", today);
  const sub4 = await engine.submit(student1, "ddddddddddd", today);
  const sub5 = await engine.submit(student1, "eeeeeeeeeee", today);

  assert(
    sub1.ok && sub2.ok && sub3.ok && sub4.ok && sub5.ok,
    "Daily Limit: First through fifth submissions succeed when valid"
  );

  // 2. Sixth submission by the same student is rejected with limit error
  const sub6 = await engine.submit(student1, "fffffffffff", today);
  assert(
    !sub6.ok && sub6.status === 409 && sub6.error?.includes("limit of 5"),
    "Daily Limit: Sixth submission by same student is rejected with 409"
  );

  // 3. Submissions are counted per student (another student can still submit)
  const student2Sub1 = await engine.submit(student2, "ggggggggggg", today);
  assert(
    student2Sub1.ok && student2Sub1.remainingSubmissions === 4,
    "Daily Limit: Different student can submit their own 5 tracks independently"
  );

  // 4. Submissions are counted per IST calendar day (student1 can submit on the next IST day)
  const student1NextDay = await engine.submit(student1, "hhhhhhhhhhh", tomorrow);
  assert(
    student1NextDay.ok && student1NextDay.remainingSubmissions === 4,
    "Daily Limit: Submissions reset on next IST calendar day"
  );

  // 5. Duplicate video submission remains rejected
  const dupVideo = await engine.submit(student2, "aaaaaaaaaaa", today);
  assert(
    !dupVideo.ok && dupVideo.status === 409 && dupVideo.error?.includes("already been submitted"),
    "Duplicate Prevention: Duplicate video in same daily queue remains rejected"
  );

  // 6. The 50-song campus queue cap remains enforced
  const capEngine = new AuthoritativeSubmissionEngine();
  // Fill queue with 50 tracks from 10 different students (5 each)
  for (let s = 1; s <= 10; s++) {
    const sStr = s.toString().padStart(2, "0");
    const email = `lit20230${sStr}@iiitl.ac.in`;
    for (let t = 1; t <= 5; t++) {
      const tStr = t.toString().padStart(2, "0");
      const vid = `v${sStr}t${tStr}abcdef`.slice(0, 11); // exactly 11 chars
      await capEngine.submit(email, vid, today);
    }
  }
  // Try 51st track by an 11th student
  const sub51 = await capEngine.submit("lit2023099@iiitl.ac.in", "overflw1234", today);
  assert(
    !sub51.ok && sub51.status === 409 && sub51.error?.includes("queue is full"),
    "Capacity Limit: Campus queue cap of 50 songs remains strictly enforced"
  );


  // 7. Concurrent submissions cannot exceed per-student limit (Race safety)
  const raceEngine = new AuthoritativeSubmissionEngine();
  const simultaneousRequests = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) =>
    raceEngine.submit(student1, `racevid000${i}`, today)
  );
  const raceResults = await Promise.all(simultaneousRequests);
  const raceSuccesses = raceResults.filter((r) => r.ok);
  const raceFailures = raceResults.filter((r) => !r.ok);
  assert(
    raceSuccesses.length === 5 && raceFailures.length === 5,
    "Concurrency: Simultaneous submissions under row lock cannot exceed 5 per student"
  );

  // 8. Unauthorized users and non-campus accounts remain rejected
  const unauthSub = await engine.submit(nonCampusUser, "unauth12345", today);
  assert(
    !unauthSub.ok && unauthSub.status === 403,
    "Security: Non-campus email (@gmail.com) is rejected with 403"
  );

  // 9. UI / Queue remaining count calculation
  const remaining1 = engine.getRemainingSubmissions(student1, today);
  const remaining2 = engine.getRemainingSubmissions(student2, today);
  assert(
    remaining1 === 0 && remaining2 === 4,
    "UI State: Remaining submissions accurately derived from authoritative data (0 for student1, 4 for student2)"
  );

  return results;
}
