import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getPipelineHealth } from "@/lib/ingest/health";

/**
 * Readiness, as opposed to `/api/v1/health`'s liveness.
 *
 * Returns 503 when degraded so an uptime monitor can watch it directly. Note
 * that "degraded" here mostly means *stale data*, not a crashed process — the
 * failure this pipeline actually suffers is a source that keeps returning 200
 * while the numbers behind it stop moving.
 */
export async function GET() {
  try {
    const health = await getPipelineHealth(createServiceClient());
    return NextResponse.json(
      { data: health },
      { status: health.status === "ok" ? 200 : 503 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "health check failed",
        },
      },
      { status: 503 },
    );
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
