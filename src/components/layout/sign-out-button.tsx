"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({
  email,
  isPlaceholder = false,
}: {
  email: string;
  isPlaceholder?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Nothing to sign out of while the auth bypass is on, and calling signOut()
  // against a session that does not exist just produces a confusing error.
  if (isPlaceholder) {
    return (
      <span className="font-mono text-xs text-ink-3">not signed in &middot; preview</span>
    );
  }

  async function signOut() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden font-mono text-xs text-ink-3 sm:inline">{email}</span>
      <button
        type="button"
        onClick={signOut}
        disabled={busy}
        className="rounded border border-rule px-2.5 py-1 text-xs text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent disabled:opacity-50"
      >
        {busy ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}
