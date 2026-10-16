/**
 * Environment variable validation.
 * Throws at startup if any required variable is missing.
 * Never import this in client components — use the client-safe subset below.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `[IIITL FM] Missing required environment variable: ${key}\n` +
        `  Check your .env.local file. See .env.local.example for reference.`
    );
  }
  return value;
}

/** Server-only environment variables. Never expose to the browser. */
export const serverEnv = {
  SUPABASE_SERVICE_ROLE_KEY: () => requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
} as const;

/** Public environment variables — safe to use in both server and client code. */
export const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  NEXT_PUBLIC_SITE_URL:
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
} as const;
