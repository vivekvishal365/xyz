import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { parsePublicEnv, parseServerEnv } from "@/lib/env";

/**
 * Service-role client. BYPASSES ROW-LEVEL SECURITY.
 *
 * Deliberately in its own file, free of `next/headers`, so the ingestion
 * pipeline, cron workers and CLI scripts can import it without dragging in
 * Next's request context — which they have no access to and which would throw.
 *
 * Only for trusted server jobs that write content tables. Never derive a
 * user-facing response from this client without filtering by the caller's
 * identity yourself: RLS will not do it for you.
 */
export function createServiceClient(): SupabaseClient {
  const publicEnv = parsePublicEnv();
  const serverEnv = parseServerEnv();

  return createSupabaseClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
