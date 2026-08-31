import { Inngest } from "inngest";

/**
 * Inngest client.
 *
 * `01-architecture.md` §3 chose this over bare Vercel Cron: cron is a fine
 * *trigger* and a poor *runtime*. Ingesting ~20 indicators across flaky
 * government sources, then backtesting each, exceeds a serverless function's
 * execution ceiling — and a plain cron gives no durable retries, so a ministry
 * site returning 502 at 06:00 means that indicator is silently missing all day.
 */
export const inngest = new Inngest({ id: "signalx" });
