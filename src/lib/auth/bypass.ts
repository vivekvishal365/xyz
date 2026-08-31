/**
 * TEMPORARY — authentication bypass for UI testing.
 *
 * Set NEXT_PUBLIC_AUTH_BYPASS=true to make the five tab routes publicly
 * reachable without a session. Off unless explicitly switched on.
 *
 * Deliberately built as a flag rather than by deleting the guard in proxy.ts:
 * a commented-out auth check looks like working code in a diff, and this one
 * has to survive on a live deployment for a while. The flag is loud instead —
 * `AuthBypassBanner` renders on every page while it is active.
 *
 * REMOVING THIS (one commit, when UI testing is done):
 *   1. delete this file and src/components/layout/auth-bypass-banner.tsx
 *   2. drop the two `isAuthBypassEnabled()` branches in src/proxy.ts and
 *      src/app/(app)/layout.tsx
 *   3. drop NEXT_PUBLIC_AUTH_BYPASS from src/lib/env.ts and .env.example
 *   4. unset the variable in Vercel
 * `npm run typecheck` will point at anything missed.
 */

export type AppUser = {
  id: string;
  email: string;
  displayName: string | null;
  /** True when this is the placeholder identity, not a real signed-in user. */
  isPlaceholder: boolean;
};

/**
 * Stand-in identity used while the bypass is active, so components that expect
 * a user render instead of crashing.
 *
 * The UUID is fixed and obviously fake. If a row ever appears in the database
 * owned by this id, something wrote user data during a bypass session and that
 * is worth finding.
 */
export const PLACEHOLDER_USER: AppUser = {
  id: "00000000-0000-4000-8000-000000000000",
  email: "preview@signalx.local",
  displayName: "Preview",
  isPlaceholder: true,
};

export function isAuthBypassEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_BYPASS === "true";
}
