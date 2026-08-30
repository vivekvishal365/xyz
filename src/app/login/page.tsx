import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">SignalX</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">India Intelligence</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            Know what is changing before it becomes obvious.
          </p>
        </div>

        <LoginForm nextPath={next ?? "/home"} />

        <p className="mt-8 text-xs leading-relaxed text-ink-3">
          SignalX provides economic intelligence and scenario analysis, not investment advice.{" "}
          <Link
            href="/legal/disclaimer"
            className="text-accent-ink underline underline-offset-2 hover:no-underline"
          >
            Disclaimer
          </Link>
        </p>
      </div>
    </main>
  );
}
