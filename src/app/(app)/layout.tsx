import { redirect } from "next/navigation";
import { getAppUser } from "@/lib/auth/server";
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

  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh md:pl-56">
      <PrimaryNav />
      <div className="flex min-h-dvh flex-col">
        <AuthBypassBanner />
        <header className="flex items-center justify-between border-b border-rule px-4 py-3 md:px-8">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3 md:hidden">
            SignalX
          </span>
          <span className="hidden md:block" />
          <SignOutButton email={user.email} isPlaceholder={user.isPlaceholder} />
        </header>
        <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
        <DisclaimerBar />
      </div>
    </div>
  );
}
