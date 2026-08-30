"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { parsePublicEnv } from "@/lib/env";

type Status = { kind: "idle" } | { kind: "sent" } | { kind: "error"; message: string };

/**
 * D10 — email + Google for MVP.
 *
 * Email uses a magic link rather than a password: it is one fewer credential to
 * store, and it sidesteps password reset entirely for Phase 0.
 */
export function LoginForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const redirectTo = () => {
    const { NEXT_PUBLIC_SITE_URL } = parsePublicEnv();
    const url = new URL("/auth/callback", NEXT_PUBLIC_SITE_URL);
    url.searchParams.set("next", nextPath);
    return url.toString();
  };

  async function signInWithEmail(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus({ kind: "idle" });

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo() },
    });

    setBusy(false);
    setStatus(
      error ? { kind: "error", message: error.message } : { kind: "sent" },
    );
  }

  async function signInWithGoogle() {
    setBusy(true);
    setStatus({ kind: "idle" });

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: redirectTo() },
    });

    if (error) {
      setBusy(false);
      setStatus({ kind: "error", message: error.message });
    }
  }

  if (status.kind === "sent") {
    return (
      <div className="rounded border border-rule bg-surface px-4 py-5">
        <h2 className="text-sm font-semibold">Check your email</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2">
          We sent a sign-in link to <span className="font-mono text-xs">{email}</span>. It expires
          in an hour.
        </p>
        <button
          type="button"
          onClick={() => setStatus({ kind: "idle" })}
          className="mt-3 text-xs text-accent-ink underline underline-offset-2 hover:no-underline"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={signInWithEmail} className="flex flex-col gap-2.5">
        <label htmlFor="email" className="font-mono text-[11px] uppercase tracking-[0.11em] text-ink-3">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded border border-rule bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-ink-3 focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send sign-in link"}
        </button>
      </form>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-rule" />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">or</span>
        <span className="h-px flex-1 bg-rule" />
      </div>

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={busy}
        className="rounded border border-rule bg-surface px-3 py-2 text-sm text-ink transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-50"
      >
        Continue with Google
      </button>

      {status.kind === "error" ? (
        <p role="alert" className="text-sm text-sev-high">
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
