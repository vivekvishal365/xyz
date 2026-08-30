import { NextResponse } from "next/server";

/**
 * Liveness probe and the first entry in the versioned API surface described in
 * docs/03-data-sources.md §4. Deliberately does not touch the database — a
 * health check that fails when Postgres is slow is a health check that pages
 * you for the wrong reason.
 */
export function GET() {
  return NextResponse.json({
    data: { status: "ok", service: "signalx", version: "v1" },
    meta: { checkedAt: new Date().toISOString() },
  });
}
