"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Radio, LineChart, Search, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

/** PRD §9 — the five primary destinations. */
const NAV = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/signals", label: "Signals", icon: Radio },
  { href: "/markets", label: "Markets", icon: LineChart },
  { href: "/explore", label: "Explore", icon: Search },
  { href: "/watchlist", label: "Watchlist", icon: Bookmark },
] as const;

export function PrimaryNav() {
  const pathname = usePathname();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {/* Mobile: bottom bar. PRD §9 calls for bottom navigation. */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      >
        <ul className="grid grid-cols-5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
                    active ? "text-accent-ink" : "text-ink-3 hover:text-ink-2",
                  )}
                >
                  <Icon size={19} strokeWidth={active ? 2.2 : 1.7} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop: left rail. */}
      <nav
        aria-label="Primary"
        className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-rule bg-surface px-3 py-5 md:flex"
      >
        <div className="px-2 pb-6">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
            SignalX
          </span>
          <p className="mt-0.5 text-sm text-ink-2">India Intelligence</p>
        </div>
        <ul className="flex flex-col gap-0.5">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded px-2.5 py-2 text-sm transition-colors",
                    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                    active
                      ? "bg-accent-bg font-medium text-accent-ink"
                      : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon size={17} strokeWidth={active ? 2.2 : 1.7} aria-hidden />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
