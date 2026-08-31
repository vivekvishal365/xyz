import { isAuthBypassEnabled } from "@/lib/auth/bypass";

/**
 * Renders only while NEXT_PUBLIC_AUTH_BYPASS is on. Its whole job is to make an
 * unprotected deployment impossible to mistake for a protected one.
 */
export function AuthBypassBanner() {
  if (!isAuthBypassEnabled()) return null;

  return (
    <div
      role="status"
      className="border-b border-sev-high/40 bg-sev-high-bg px-4 py-2 text-center text-xs text-sev-high md:px-8"
    >
      <strong className="font-semibold">Authentication bypassed.</strong> These pages are public to
      anyone with the link, and you are not signed in. Temporary, for UI testing.
    </div>
  );
}
