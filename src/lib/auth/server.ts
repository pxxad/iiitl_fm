import { createClient } from "@/lib/supabase/server";
import { isCampusEmail } from "@/lib/auth/domain-guard";
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
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

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
