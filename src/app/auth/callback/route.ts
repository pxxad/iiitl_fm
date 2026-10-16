import { createClient } from "@/lib/supabase/server";
import { isCampusEmail, parseStudentDetailsFromEmail, sanitizeRedirectPath } from "@/lib/auth/domain-guard";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const rawNext =
    requestUrl.searchParams.get("next") ??
    requestUrl.searchParams.get("redirectTo") ??
    "/";
  const next = sanitizeRedirectPath(rawNext, "/");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", request.url));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.user) {
    return NextResponse.redirect(new URL("/login?error=auth_failed", request.url));
  }

  const user = data.user;
  const email = user.email;

  // ─── Strict Server-Side Email Domain Authorization ─────────────────────────
  if (!isCampusEmail(email)) {
    // Non-IIITL account detected. Revoke session immediately.
    await supabase.auth.signOut();
    return NextResponse.redirect(
      new URL("/login?error=campus_access_only", request.url)
    );
  }

  // ─── Profile Upsert into public.profiles ────────────────────────────────────
  try {
    const meta = user.user_metadata ?? {};
    const fullName =
      (meta.full_name as string) || (meta.name as string) || null;
    const avatarUrl =
      (meta.avatar_url as string) || (meta.picture as string) || null;

    const studentDetails = parseStudentDetailsFromEmail(email);

    // Upsert student profile
    await supabase.from("profiles").upsert(
      {
        id: user.id,
        full_name: fullName,
        avatar_url: avatarUrl,
        branch: studentDetails.branch,
        batch: studentDetails.batch,
      },
      { onConflict: "id" }
    );
  } catch (profileError) {
    // Non-blocking if the trigger already created it, but log silently
    console.error("[Auth Callback] Profile upsert warning:", profileError);
  }

  // Safe redirect to requested destination
  return NextResponse.redirect(new URL(next, request.url));
}
