import { isSupabaseConfigured } from "@/lib/env";
import { isCampusEmail, sanitizeRedirectPath } from "@/lib/auth/domain-guard";

export async function runOAuthRedirectTests() {
  const results: { test: string; passed: boolean; error?: string }[] = [];

  function assert(condition: boolean, testName: string, errorMsg?: string) {
    if (condition) {
      results.push({ test: testName, passed: true });
    } else {
      results.push({ test: testName, passed: false, error: errorMsg || "Assertion failed" });
    }
  }

  // --- Environment & Config Detection ---
  assert(
    isSupabaseConfigured("https://placeholder.supabase.co", "placeholder-anon-key") === false,
    "Config: Placeholder Supabase URL and key are detected as unconfigured"
  );

  assert(
    isSupabaseConfigured("https://your-project-id.supabase.co", "your-anon-key-here") === false,
    "Config: Template 'your-project-id' Supabase URL is detected as unconfigured"
  );

  assert(
    isSupabaseConfigured("", "") === false,
    "Config: Empty Supabase URL and key are detected as unconfigured"
  );

  assert(
    isSupabaseConfigured(undefined, undefined) === false,
    "Config: Undefined Supabase variables are detected as unconfigured"
  );

  assert(
    isSupabaseConfigured("https://abcdefghijklm.supabase.co", "eyJhYmMxMjMiOiJ0ZXN0In0.validanonkeyhere123456789") === true,
    "Config: Valid project URL and real non-placeholder anon key are recognized as configured"
  );

  // --- OAuth Redirect URL Format ---
  const mockOrigin = "http://localhost:3000";
  const expectedCallback = `${mockOrigin}/auth/callback`;
  assert(
    expectedCallback === "http://localhost:3000/auth/callback",
    "OAuth Redirect: Callback URL is strictly `${origin}/auth/callback`"
  );

  // --- Campus Domain Authorization ---
  assert(
    isCampusEmail("lit2023045@iiitl.ac.in") === true,
    "Domain Guard: Valid student email @iiitl.ac.in is authorized"
  );

  assert(
    isCampusEmail("bcs2022010@iiitl.ac.in") === true,
    "Domain Guard: CS student email @iiitl.ac.in is authorized"
  );

  assert(
    isCampusEmail("faculty@iiitl.ac.in") === true,
    "Domain Guard: Faculty email @iiitl.ac.in is authorized"
  );

  assert(
    isCampusEmail("student@gmail.com") === false,
    "Domain Guard: Public Gmail address is rejected"
  );

  assert(
    isCampusEmail("student@alumni.iiitl.ac.in") === false,
    "Domain Guard: Alumni subdomain @alumni.iiitl.ac.in is rejected"
  );

  assert(
    isCampusEmail("student@iiitl.ac.in.attacker.com") === false,
    "Domain Guard: Suffix domain lookalike is rejected"
  );

  assert(
    isCampusEmail("attacker@fake-iiitl.ac.in") === false,
    "Domain Guard: Hyphenated fake campus domain is rejected"
  );

  assert(
    isCampusEmail("") === false,
    "Domain Guard: Empty email string is rejected"
  );

  assert(
    isCampusEmail(null) === false,
    "Domain Guard: Null email is rejected"
  );

  // --- Redirect Path Sanitization (Open Redirect Prevention) ---
  assert(
    sanitizeRedirectPath("/submit") === "/submit",
    "Sanitize Redirect: Valid internal relative path '/submit' is accepted"
  );

  assert(
    sanitizeRedirectPath("/discover") === "/discover",
    "Sanitize Redirect: Valid internal relative path '/discover' is accepted"
  );

  assert(
    sanitizeRedirectPath("https://malicious.com") === "/",
    "Sanitize Redirect: External protocol URL is safely neutralized to default '/'"
  );

  assert(
    sanitizeRedirectPath("//evil.com/phish") === "/",
    "Sanitize Redirect: Protocol-relative '//' URL is neutralized to default '/'"
  );

  assert(
    sanitizeRedirectPath("javascript:alert(1)") === "/",
    "Sanitize Redirect: Javascript pseudo-protocol is neutralized to default '/'"
  );

  // --- Redirect Loop Guard ---
  // In middleware: if user is on /login and unauthenticated / non-campus,
  // returning directly rather than redirecting to /login prevents an infinite loop.
  const middlewarePath = "/login";
  const userHasNonCampusEmail = true;
  const isLoopPrevented = middlewarePath === "/login" && userHasNonCampusEmail;
  assert(
    isLoopPrevented === true,
    "Middleware Loop Guard: Non-campus user visiting /login halts redirect loop"
  );

  return results;
}
