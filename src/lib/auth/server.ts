import { createClient } from "@/lib/supabase/server";
import { isCampusEmail, parseStudentDetailsFromEmail } from "@/lib/auth/domain-guard";
import type { Profile } from "@/lib/types";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

export interface CampusUserSession {
  user: User;
  profile: Profile | null;
  email: string;
}

/**
 * Returns the authenticated user session from cookies, or null if unauthenticated.
 * Verifies email belongs to @iiitl.ac.in.
 * If the profile row is missing in public.profiles (e.g. user registered before migrations,
 * or trigger did not execute), idempotently creates/upserts it using the session's verified data.
 */
export async function getCampusUser(): Promise<CampusUserSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user || !user.email) {
    return null;
  }

  // Strict domain enforcement
  if (!isCampusEmail(user.email)) {
    return null;
  }

  // Fetch student profile
  let { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  // Self-healing: If profile does not exist in public.profiles, idempotently insert it
  // using verified session metadata so foreign key constraints (like fk_songs_profiles) are satisfied.
  if (!profile) {
    const meta = user.user_metadata ?? {};
    const fullName =
      (meta.full_name as string) || (meta.name as string) || null;
    const avatarUrl =
      (meta.avatar_url as string) || (meta.picture as string) || null;
    const studentDetails = parseStudentDetailsFromEmail(user.email);

    const { data: newProfile, error: upsertError } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          full_name: fullName,
          avatar_url: avatarUrl,
          branch: studentDetails.branch,
          batch: studentDetails.batch,
        },
        { onConflict: "id" }
      )
      .select("*")
      .single();

    if (!upsertError && newProfile) {
      profile = newProfile;
    } else if (upsertError) {
      console.warn("[getCampusUser] Self-healing profile upsert warning:", upsertError.message);
    }
  }

  return {
    user,
    profile: (profile as Profile) ?? null,
    email: user.email.toLowerCase(),
  };
}

/**
 * Enforces authentication on server components / pages.
 * Redirects to /login if unauthenticated or unauthorized.
 */
export async function requireCampusUser(
  redirectTo?: string
): Promise<CampusUserSession> {
  const session = await getCampusUser();

  if (!session) {
    const search = redirectTo
      ? `?redirectTo=${encodeURIComponent(redirectTo)}`
      : "";
    redirect(`/login${search}`);
  }

  return session;
}
