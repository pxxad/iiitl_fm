import { createClient } from "@/lib/supabase/server";
import { isCampusEmail, parseStudentDetailsFromEmail, sanitizeRedirectPath } from "@/lib/auth/domain-guard";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { isSupabaseConfigured } from "@/lib/env";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);

  // 1. Detect missing or placeholder Supabase configuration
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(new URL("/login?error=config_missing", request.url));
  }

  // 2. Handle provider-level OAuth errors (e.g. user cancelled prompt or access_denied)
  const oauthError = requestUrl.searchParams.get("error");
  if (oauthError) {
    const errorDesc = requestUrl.searchParams.get("error_description") || "";
    console.warn(`[Auth Callback] OAuth error from provider: ${oauthError} - ${errorDesc}`);
    return NextResponse.redirect(new URL("/login?error=oauth_error", request.url));
  }

  // 3. Extract authorization code and target redirect path
  const code = requestUrl.searchParams.get("code");
  const cookieNext = request.cookies.get("sb_auth_next")?.value;
  const rawNext =
    requestUrl.searchParams.get("next") ??
    requestUrl.searchParams.get("redirectTo") ??
    cookieNext ??
    "/";
  const next = sanitizeRedirectPath(rawNext, "/");

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", request.url));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data?.user) {
    console.error("[Auth Callback] Exchange code for session failed:", error?.message);
    return NextResponse.redirect(new URL("/login?error=auth_failed", request.url));
  }

  const user = data.user;
  const email = user.email;

  // 4. Strict Server-Side Email Domain Authorization
  if (!isCampusEmail(email)) {
    // Non-IIITL account detected. Revoke session immediately.
    await supabase.auth.signOut();
    const deniedResponse = NextResponse.redirect(
      new URL("/login?error=campus_access_only", request.url)
    );
    // Ensure cookie deletions are carried over to the redirect response
    const cookieStore = await cookies();
    cookieStore.getAll().forEach((c) => {
      deniedResponse.cookies.set(c.name, c.value);
    });
    deniedResponse.cookies.delete("sb_auth_next");
    return deniedResponse;
  }

  // 5. Profile Upsert into public.profiles
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

  // 6. Safe redirect to requested destination with persisted session cookies
  const successResponse = NextResponse.redirect(new URL(next, request.url));
  const cookieStore = await cookies();
  cookieStore.getAll().forEach((c) => {
    successResponse.cookies.set(c.name, c.value);
  });
  successResponse.cookies.delete("sb_auth_next");
  return successResponse;
}

