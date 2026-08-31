import { createClient } from "@/lib/supabase/server";
import { isAuthBypassEnabled, PLACEHOLDER_USER, type AppUser } from "@/lib/auth/bypass";

/**
 * The single place server code asks "who is this?".
 *
 * Components read this rather than reaching for Supabase themselves, which is
 * what lets the bypass exist in one branch instead of scattered mocks — and
 * what will let it be removed in one commit.
 */
export async function getAppUser(): Promise<AppUser | null> {
  if (isAuthBypassEnabled()) return PLACEHOLDER_USER;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const fullName = user.user_metadata?.["full_name"];

  return {
    id: user.id,
    email: user.email ?? "",
    displayName: typeof fullName === "string" ? fullName : null,
    isPlaceholder: false,
  };
}
