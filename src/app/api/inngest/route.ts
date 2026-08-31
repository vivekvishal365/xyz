import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

/**
 * Inngest's endpoint. It registers the functions and receives step callbacks.
 *
 * Requests are signed and verified against INNGEST_SIGNING_KEY, so this is not
 * an open trigger despite being unauthenticated in the app's own terms — which
 * is why /api/inngest is deliberately absent from the proxy's protected list.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});

// The pipeline is well past what an edge runtime allows.
export const runtime = "nodejs";
export const maxDuration = 300;
