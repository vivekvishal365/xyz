import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { parsePublicEnv, parseServerEnv } from "@/lib/env";

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

/**
 * Service-role client. BYPASSES ROW-LEVEL SECURITY.
 *
 * Only for the ingestion pipeline and other trusted server jobs that write
 * content tables. Never derive a user-facing response from this client without
 * filtering by the caller's identity yourself — RLS will not do it for you.
 */
export function createServiceClient() {
  const publicEnv = parsePublicEnv();
  const serverEnv = parseServerEnv();

  return createSupabaseClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
