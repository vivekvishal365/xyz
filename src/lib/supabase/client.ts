import { createBrowserClient } from "@supabase/ssr";
import { parsePublicEnv } from "@/lib/env";

/**
 * Browser Supabase client — AUTH ONLY.
 *
 * 01-architecture.md §5: the browser never talks to Supabase directly for
 * content. Every content read goes through /api/v1, which keeps RLS scoped to
 * user-owned tables and puts rate limiting and tier gating in one place.
 *
 * If you find yourself selecting from `signals` here, that belongs in the
 * service layer behind an API route instead.
 */
export function createClient() {
  const env = parsePublicEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
