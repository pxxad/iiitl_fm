import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { publicEnv } from "@/lib/env";
import { isCampusEmail, sanitizeRedirectPath } from "@/lib/auth/domain-guard";

type CookieItem = { name: string; value: string; options: CookieOptions };

/**
 * Supabase middleware client.
 * Refreshes auth sessions on every request and manages route protection.
 */
export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const protectedPaths = ["/submit", "/discover", "/admin"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  // If Supabase environment variables are missing or placeholders, bypass network calls
  if (!publicEnv.isConfigured) {
    if (isProtected) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = "/login";
      redirectUrl.searchParams.set("redirectTo", pathname);
      redirectUrl.searchParams.set("error", "config_missing");
      return NextResponse.redirect(redirectUrl);
    }
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieItem[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — important for Next.js SSR
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If user is logged in with a non-campus email, revoke and send to /login
  if (user && user.email && !isCampusEmail(user.email)) {
    await supabase.auth.signOut();

    // If already on /login, do not redirect to prevent infinite redirect loops;
    // return response directly with cleared cookies.
    if (pathname === "/login") {
      return supabaseResponse;
    }

    const deniedUrl = request.nextUrl.clone();
    deniedUrl.pathname = "/login";
    deniedUrl.searchParams.set("error", "campus_access_only");
    const redirectResponse = NextResponse.redirect(deniedUrl);

    // Carry over cookie clearing headers to the redirect response
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      redirectResponse.cookies.set(cookie.name, cookie.value, cookie);
    });

    return redirectResponse;
  }

  // If user is already authenticated with valid campus email and visits /login, redirect home
  if (user && user.email && isCampusEmail(user.email) && pathname === "/login") {
    const rawRedirect = request.nextUrl.searchParams.get("redirectTo");
    const target = sanitizeRedirectPath(rawRedirect, "/");
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = target;
    homeUrl.search = "";
    return NextResponse.redirect(homeUrl);
  }

  if (isProtected && (!user || !isCampusEmail(user.email))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
