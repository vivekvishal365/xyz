/**
 * Renders while the auth bypass is on. Its whole job is to make an unprotected
 * deployment impossible to mistake for a protected one.
 *
 * Takes `active` as a prop rather than reading the environment itself. The
 * client can only see the build-inlined `NEXT_PUBLIC_` variable, so a bypass
 * enabled through the server-only `AUTH_BYPASS` would open the gates with no
 * banner showing — an unprotected deployment that looks protected. The layout
 * passes the same answer the gate used.
 */
export function AuthBypassBanner({ active }: { active: boolean }) {
  if (!active) return null;

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
