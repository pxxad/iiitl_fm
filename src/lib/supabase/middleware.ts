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

  const pathname = request.nextUrl.pathname;

  // If user is logged in with a non-campus email, revoke and send to /login
  if (user && user.email && !isCampusEmail(user.email)) {
    await supabase.auth.signOut();
    const deniedUrl = request.nextUrl.clone();
    deniedUrl.pathname = "/login";
    deniedUrl.searchParams.set("error", "campus_access_only");
    return NextResponse.redirect(deniedUrl);
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

  // Protected routes list
  const protectedPaths = ["/submit", "/discover", "/admin"];
  const isProtected = protectedPaths.some((p) => pathname.startsWith(p));

  if (isProtected && (!user || !isCampusEmail(user.email))) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
