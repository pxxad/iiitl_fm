/**
 * Re-export Supabase client for convenience.
 * Import from "@/lib/supabase/client" in client components.
 * Import from "@/lib/supabase/server" in server components / actions.
 */
export { createClient as createBrowserClient } from "./client";
export { createClient as createServerClient } from "./server";
