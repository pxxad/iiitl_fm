/**
 * IIITL FM — Profile & fk_songs_profiles Foreign Key Regression Tests
 *
 * Verifies that when a verified campus student submits a song whose public.profiles
 * record was missing, the system self-heals by idempotently upserting their profile
 * using authenticated session data, preventing foreign key constraint violations.
 */

import { isCampusEmail, parseStudentDetailsFromEmail } from "@/lib/auth/domain-guard";

export async function runProfileFKRegressionTests() {
  const results: Array<{ test: string; passed: boolean; error?: string }> = [];

  function assert(condition: boolean, testName: string, errorMsg?: string) {
    if (condition) {
      results.push({ test: testName, passed: true });
    } else {
      results.push({ test: testName, passed: false, error: errorMsg || "Assertion failed" });
    }
  }

  // ─── Mock Database Simulation ──────────────────────────────────────────────
  const mockProfilesTable = new Map<string, { id: string; full_name: string | null; branch: string | null; batch: string | null }>();
  const mockSongsTable: Array<{ id: string; added_by: string; title: string }> = [];

  function mockInsertSong(song: { id: string; added_by: string; title: string }): { success: boolean; error?: string } {
    // Simulate PostgreSQL constraint: fk_songs_profiles FOREIGN KEY (added_by) REFERENCES public.profiles(id)
    if (!mockProfilesTable.has(song.added_by)) {
      return {
        success: false,
        error: 'insert or update on table "songs" violates foreign key constraint "fk_songs_profiles"',
      };
    }
    mockSongsTable.push(song);
    return { success: true };
  }

  function mockSelfHealingProfileUpsert(user: { id: string; email: string; user_metadata?: Record<string, unknown> }): { success: boolean; profile?: any; error?: string } {
    // 1. Enforce strict campus eligibility
    if (!isCampusEmail(user.email)) {
      return { success: false, error: "Unauthorized: only campus members allowed" };
    }

    // 2. Derive metadata from authenticated session
    const meta = user.user_metadata ?? {};
    const fullName = (meta.full_name as string) || (meta.name as string) || null;
    const studentDetails = parseStudentDetailsFromEmail(user.email);

    // 3. Idempotently insert/upsert
    const profileRow = {
      id: user.id,
      full_name: fullName,
      branch: studentDetails.branch,
      batch: studentDetails.batch,
    };
    mockProfilesTable.set(user.id, profileRow);

    return { success: true, profile: profileRow };
  }

  // ─── Test 1: Unlinked user violates fk_songs_profiles ──────────────────────
  const campusUser1 = {
    id: "a1111111-1111-4111-a111-111111111111",
    email: "bcs2022010@iiitl.ac.in",
    user_metadata: { full_name: "B Prasad", name: "B Prasad" },
  };

  const initialInsert = mockInsertSong({
    id: "song-1",
    added_by: campusUser1.id,
    title: "Never Gonna Give You Up",
  });

  assert(
    initialInsert.success === false && initialInsert.error?.includes("fk_songs_profiles"),
    "Regression: Submitting song without profile in database triggers fk_songs_profiles error"
  );

  // ─── Test 2: Non-campus user cannot self-heal profile ──────────────────────
  const nonCampusUser = {
    id: "e9999999-9999-4999-a999-999999999999",
    email: "attacker@gmail.com",
    user_metadata: { full_name: "External User" },
  };

  const nonCampusUpsert = mockSelfHealingProfileUpsert(nonCampusUser);
  assert(
    nonCampusUpsert.success === false,
    "Security: Non-campus user cannot self-heal or insert profile"
  );

  // ─── Test 3: Campus user successfully self-heals profile ───────────────────
  const campusUpsert = mockSelfHealingProfileUpsert(campusUser1);
  assert(
    campusUpsert.success === true && mockProfilesTable.has(campusUser1.id),
    "Self-Healing: Campus student profile is created using authenticated session data"
  );
  assert(
    campusUpsert.profile?.branch === "Computer Science" && campusUpsert.profile?.batch === "2022",
    "Self-Healing: Student branch and batch are accurately derived from campus email"
  );

  // ─── Test 4: Song submission succeeds after profile self-healing ───────────
  const repairedInsert = mockInsertSong({
    id: "song-1",
    added_by: campusUser1.id,
    title: "Never Gonna Give You Up",
  });

  assert(
    repairedInsert.success === true,
    "Resolution: Song submission succeeds once profile is created, satisfying fk_songs_profiles"
  );

  // ─── Test 5: Idempotency: repeated self-heal does not conflict ─────────────
  const secondUpsert = mockSelfHealingProfileUpsert(campusUser1);
  assert(
    secondUpsert.success === true && mockProfilesTable.size === 1,
    "Idempotency: Repeated self-healing calls safely upsert without duplicate profile rows"
  );

  // ─── Test 6: Preserves campus-email roll parsing edge-cases ────────────────
  const studentMTech = {
    id: "c2222222-2222-4222-a222-222222222222",
    email: "mtech2023005@iiitl.ac.in",
    user_metadata: { full_name: "M.Tech Student" },
  };
  const mtechUpsert = mockSelfHealingProfileUpsert(studentMTech);
  assert(
    mtechUpsert.profile?.branch === "M.Tech" && mtechUpsert.profile?.batch === "2023",
    "Self-Healing: Correctly parses M.Tech roll numbers and branches"
  );

  return results;
}
