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
} as const;
