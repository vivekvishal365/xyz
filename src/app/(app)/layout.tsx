import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrimaryNav } from "@/components/layout/primary-nav";
import { DisclaimerBar } from "@/components/layout/disclaimer";
import { SignOutButton } from "@/components/layout/sign-out-button";

/**
 * The authenticated app shell. Middleware already redirects anonymous users,
 * but this check is not redundant — middleware can be bypassed by route config
 * mistakes, and a layout guard fails closed.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="min-h-dvh md:pl-56">
      <PrimaryNav />
      <div className="flex min-h-dvh flex-col">
        <header className="flex items-center justify-between border-b border-rule px-4 py-3 md:px-8">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3 md:hidden">
            SignalX
          </span>
          <span className="hidden md:block" />
          <SignOutButton email={user.email ?? ""} />
        </header>
        <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10">{children}</main>
        <DisclaimerBar />
      </div>
    </div>
  );
}
