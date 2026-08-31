import Link from "next/link";
import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth/server";
import { isAuthBypassActive } from "@/lib/auth/bypass";
import { PrimaryNav } from "@/components/layout/primary-nav";
import { DisclaimerBar } from "@/components/layout/disclaimer";
import { AuthBypassBanner } from "@/components/layout/auth-bypass-banner";
import { SignOutButton } from "@/components/layout/sign-out-button";

/**
 * The authenticated app shell. The proxy already redirects anonymous users, but
 * this check is not redundant — a route-config mistake can miss the proxy, and
 * a layout guard fails closed.
 *
 * While the auth bypass is on, getAppUser() returns the placeholder identity
 * and neither guard fires.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getAppUser();
  // Same answer the gate used, so the banner cannot disagree with reality.
  const bypassActive = isAuthBypassActive();

  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh md:pl-56">
      <PrimaryNav />
      <div className="flex min-h-dvh flex-col">
        <AuthBypassBanner active={bypassActive} />
        <header className="flex items-center justify-between gap-4 border-b border-rule px-4 py-3 md:px-8">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3 md:hidden">
            SignalX
          </span>
          {/*
            TODO(access-control): /admin is protected by authentication only —
            there is no role check yet, so any signed-in user can curate the
            graph. Needs a role column and a guard before real users exist.
          */}
          <nav aria-label="Internal" className="hidden gap-3 md:flex">
            <Link
              href="/indicators"
              className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink-2"
            >
              Indicators
            </Link>
            <Link
              href="/admin/graph"
              className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink-2"
            >
              Curation
            </Link>
            <Link
              href="/admin/health"
              className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-3 hover:text-ink-2"
            >
              Health
            </Link>
          </nav>
          <SignOutButton email={user.email} isPlaceholder={user.isPlaceholder} />
        </header>
        <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
        <DisclaimerBar />
      </div>
    </div>
  );
}
