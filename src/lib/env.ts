/**
 * Environment variable validation.
 * In Next.js, public client-side variables MUST use direct static property access
 * (e.g. process.env.NEXT_PUBLIC_...) so Webpack's DefinePlugin inlines them into the client bundle.
 */

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/** Checks whether Supabase has been configured with real, non-placeholder credentials. */
export function isSupabaseConfigured(
  customUrl?: string,
  customKey?: string
): boolean {
  const url = customUrl !== undefined ? customUrl : process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = customKey !== undefined ? customKey : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return false;
  if (
    url.includes("placeholder.supabase.co") ||
    url.includes("your-project-id") ||
    url.trim() === ""
  ) {
    return false;
  }
  if (
    anonKey.includes("placeholder") ||
    anonKey.includes("your-anon-key") ||
    anonKey.trim() === ""
  ) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (!parsed.protocol.startsWith("http")) return false;
  } catch {
    return false;
  }
  return true;
}

/** Server-only environment variables. Never expose to the browser. */
export const serverEnv = {
  SUPABASE_SERVICE_ROLE_KEY: () => {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
      throw new Error(
        "[IIITL FM] Missing required environment variable: SUPABASE_SERVICE_ROLE_KEY\n" +
          "  Check your .env.local file. See .env.local.example for reference."
      );
    }
    return key;
  },
} as const;

/** Public environment variables — safe to use in both server and client code. */
export const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
  NEXT_PUBLIC_SITE_URL: siteUrl,
  isConfigured: isSupabaseConfigured(supabaseUrl, supabaseAnonKey),
} as const;

