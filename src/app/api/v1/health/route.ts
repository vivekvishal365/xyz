import { NextResponse } from "next/server";
import { authBypassSource, isAuthBypassActive } from "@/lib/auth/bypass";

/**
 * Liveness probe and the first entry in the versioned API surface described in
 * docs/03-data-sources.md §4. Deliberately does not touch the database — a
 * health check that fails when Postgres is slow is a health check that pages
 * you for the wrong reason.
 *
 * It DOES report the auth-bypass state. `NEXT_PUBLIC_*` variables are inlined
 * at build time, so a deployment can disagree with what the hosting dashboard
 * shows, and the symptom — an unexpected redirect to /login — looks like a code
 * bug. This turns thirty minutes of guessing into one request. The value is a
 * boolean and a variable name, never a secret.
 */
export function GET() {
  return NextResponse.json({
    data: {
      status: "ok",
      service: "signalx",
      version: "v1",
      auth: {
        bypassActive: isAuthBypassActive(),
        bypassSource: authBypassSource(),
      },
    },
    meta: { checkedAt: new Date().toISOString() },
  });
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
