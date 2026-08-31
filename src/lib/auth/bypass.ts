/**
 * TEMPORARY — authentication bypass for UI testing.
 *
 * Two variables, because they behave differently:
 *
 *   NEXT_PUBLIC_AUTH_BYPASS — inlined into the bundle at BUILD time. Setting it
 *     in a hosting dashboard does nothing until the next deploy.
 *   AUTH_BYPASS             — server-only, read from process.env at RUNTIME.
 *
 * That build-time inlining is exactly what bites on Vercel: the variable looks
 * set in the dashboard, and the running deployment still has the old value
 * compiled in. Either one enables the bypass, so a redeploy fixes it whichever
 * was used, and `/api/v1/health` reports which is actually live.
 *
 * Deliberately a flag rather than a deleted guard: a commented-out auth check
 * reads as working code in a diff, and this has to survive on a live
 * deployment for a while. The flag is loud instead — `AuthBypassBanner`
 * renders on every page while it is active.
 *
 * REMOVING THIS (one commit, when UI testing is done):
 *   1. delete this file and src/components/layout/auth-bypass-banner.tsx
 *   2. drop the isAuthBypass* branches in src/proxy.ts, src/lib/auth/server.ts
 *      and src/app/(app)/layout.tsx
 *   3. drop both variables from src/lib/env.ts and .env.example
 *   4. unset them in Vercel
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

/**
 * Client-safe check. Only sees the build-inlined public variable, so it must
 * NOT be used to decide whether the banner shows — see `AuthBypassBanner`,
 * which takes the server's answer as a prop. A server-only bypass with no
 * visible banner would be an unprotected deployment that looks protected.
 */
export function isAuthBypassEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_BYPASS === "true";
}

/** Server-side check. Either variable enables it. This is the real gate. */
export function isAuthBypassActive(): boolean {
  return (
    process.env.NEXT_PUBLIC_AUTH_BYPASS === "true" || process.env.AUTH_BYPASS === "true"
  );
}

/** Which variable is doing it, for the health endpoint. */
export function authBypassSource(): "none" | "NEXT_PUBLIC_AUTH_BYPASS" | "AUTH_BYPASS" {
  if (process.env.NEXT_PUBLIC_AUTH_BYPASS === "true") return "NEXT_PUBLIC_AUTH_BYPASS";
  if (process.env.AUTH_BYPASS === "true") return "AUTH_BYPASS";
  return "none";
}
