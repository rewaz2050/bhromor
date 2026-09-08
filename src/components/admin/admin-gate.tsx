"use client";

/**
 * Admin shell + auth gate (§47, §101).
 *
 * Route guard is enforced here for the demo UI; the blueprint requires the
 * real authorization check server-side/database-side once Supabase Auth +
 * admin_users exist. `/admin/login` is exempt from the gate.
 */

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import LogoMark from "@/components/logo-mark";
import {
  IconBox,
  IconExternal,
  IconGrid,
  IconLogout,
} from "@/components/ui/icons";
import {
  getAdminAuthed,
  signOutAdmin,
  subscribeAdminAuth,
} from "@/lib/admin-auth";
import { useSyncExternalStore } from "react";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: IconGrid, match: (p: string) => p === "/admin" },
  { href: "/admin/orders", label: "Orders", icon: IconBox, match: (p: string) => p.startsWith("/admin/orders") },
];

const TITLES: [RegExp, string][] = [
  [/^\/admin\/orders\/.+/, "Order details"],
  [/^\/admin\/orders$/, "Orders"],
  [/^\/admin$/, "Dashboard"],
];

const titleFor = (pathname: string): string =>
  TITLES.find(([re]) => re.test(pathname))?.[1] ?? "Admin";

export default function AdminGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const authed = useSyncExternalStore(
    subscribeAdminAuth,
    getAdminAuthed,
    () => false, // server snapshot — never authenticated
  );

  const onLogin = pathname.startsWith("/admin/login");

  useEffect(() => {
    if (!authed && !onLogin) router.replace("/admin/login");
    if (authed && onLogin) router.replace("/admin");
  }, [authed, onLogin, router]);

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-forest-950">
        <div className="flex items-center gap-3 text-ivory-100/80">
          <span className="h-2 w-2 animate-pulse rounded-full bg-gold-400" />
          <span className="text-sm tracking-wide">PROSANTI Admin</span>
        </div>
      </div>
    );
  }

  if (onLogin) return <>{children}</>;

  return (
    <div className="min-h-screen bg-ivory-100/60 lg:flex">
      {/* Sidebar */}
      <aside className="flex flex-col bg-forest-950 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ivory-100">
            <LogoMark className="h-6 w-auto" />
          </span>
          <span className="leading-tight">
            <span className="block text-[0.95rem] font-semibold tracking-[0.08em] text-ivory-50">
              PROSANTI
            </span>
            <span className="text-[0.65rem] uppercase tracking-[0.3em] text-gold-300">
              Admin
            </span>
          </span>
        </div>

        <nav aria-label="Admin" className="flex-1 space-y-1 px-3 py-4">
          {NAV.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-ivory-50/10 text-ivory-50 ring-1 ring-white/10"
                    : "text-ivory-100/60 hover:bg-white/5 hover:text-ivory-50"
                }`}
              >
                <item.icon className="h-[1.1rem] w-[1.1rem]" />
                {item.label}
              </Link>
            );
          })}

          <div className="pt-2">
            <p className="px-3.5 pb-1 text-[0.6rem] uppercase tracking-[0.28em] text-ivory-100/40">
              Coming next
            </p>
            <p className="px-3.5 pb-3 text-xs leading-5 text-ivory-100/50">
              Products · Categories · Zones · Customers
            </p>
          </div>
        </nav>

        <div className="space-y-1 border-t border-white/10 px-3 py-4">
          <Link
            href="/"
            target="_blank"
            className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-ivory-100/60 transition-colors hover:bg-white/5 hover:text-ivory-50"
          >
            <IconExternal className="h-[1.1rem] w-[1.1rem]" />
            View storefront
          </Link>
          <button
            type="button"
            onClick={() => {
              signOutAdmin();
              router.replace("/admin/login");
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-ivory-100/60 transition-colors hover:bg-white/5 hover:text-ivory-50"
          >
            <IconLogout className="h-[1.1rem] w-[1.1rem]" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-ivory-50/90 px-6 py-4 backdrop-blur lg:px-10">
          <div>
            <h1 className="font-display text-xl font-medium text-forest-900">
              {titleFor(pathname)}
            </h1>
          </div>
          <p className="hidden text-sm text-ink-soft sm:block">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
        </header>
        <main className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
