import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { parsePublicEnv } from "@/lib/env";

// Re-exported for convenience. The implementation lives in ./service so that
// non-request contexts (cron workers, scripts) can import it without pulling
// `next/headers` in with it.
export { createServiceClient } from "./service";

/**
 * Server Supabase client bound to the caller's session. Reads and writes the
 * user's own rows under row-level security.
 */
export async function createClient() {
  const env = parsePublicEnv();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only. The
          // middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}

