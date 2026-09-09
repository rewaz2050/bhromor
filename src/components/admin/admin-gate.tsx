"use client";

/**
 * Admin shell + auth gate (§47, §101).
 *
 * Route guard is enforced here for the demo UI; the blueprint requires the
 * real authorization check server-side/database-side once Supabase Auth +
 * admin_users exist. `/admin/login` is exempt from the gate.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import LogoMark from "@/components/logo-mark";
import Drawer from "@/components/ui/drawer";
import { useNotifications } from "@/lib/use-notifications";
import {
  IconBell,
  IconBox,
  IconCard,
  IconChart,
  IconExternal,
  IconFlag,
  IconGrid,
  IconImage,
  IconLeaf,
  IconLogout,
  IconMail,
  IconMapPin,
  IconMenu,
  IconSend,
  IconSettings,
  IconShield,
  IconTag,
  IconTruck,
  IconUser,
} from "@/components/ui/icons";
import {
  getAdminAuthed,
  getAdminMode,
  refreshStaffSession,
  signOutAdmin,
  subscribeAdminAuth,
} from "@/lib/admin-auth";
import { isSupabaseConfigured } from "@/lib/env";

const NAV = [
  { href: "/admin", label: "Dashboard", icon: IconGrid, match: (p: string) => p === "/admin" },
  { href: "/admin/staff", label: "Staff", icon: IconShield, match: (p: string) => p === "/admin/staff" },
  { href: "/admin/orders", label: "Orders", icon: IconBox, match: (p: string) => p.startsWith("/admin/orders") },
  { href: "/admin/reports", label: "Reports", icon: IconChart, match: (p: string) => p === "/admin/reports" },
  { href: "/admin/products", label: "Products", icon: IconTag, match: (p: string) => p.startsWith("/admin/products") },
  { href: "/admin/categories", label: "Categories", icon: IconGrid, match: (p: string) => p === "/admin/categories" },
  { href: "/admin/zones", label: "Delivery zones", icon: IconMapPin, match: (p: string) => p === "/admin/zones" },
  { href: "/admin/homepage", label: "Homepage", icon: IconLeaf, match: (p: string) => p === "/admin/homepage" },
  { href: "/admin/customers", label: "Customers", icon: IconUser, match: (p: string) => p === "/admin/customers" },
  { href: "/admin/messages", label: "Messages", icon: IconMail, match: (p: string) => p === "/admin/messages" },
  { href: "/admin/newsletter", label: "Newsletter", icon: IconSend, match: (p: string) => p === "/admin/newsletter" },
  { href: "/admin/shops", label: "Shops", icon: IconBox, match: (p: string) => p === "/admin/shops" },
  { href: "/admin/payouts", label: "Payouts", icon: IconCard, match: (p: string) => p === "/admin/payouts" },
  { href: "/admin/riders", label: "Riders", icon: IconTruck, match: (p: string) => p === "/admin/riders" },
  { href: "/admin/reviews", label: "Reviews", icon: IconFlag, match: (p: string) => p === "/admin/reviews" },
  { href: "/admin/coupons", label: "Coupons", icon: IconTag, match: (p: string) => p === "/admin/coupons" },
  { href: "/admin/inventory", label: "Inventory", icon: IconBox, match: (p: string) => p === "/admin/inventory" },
  { href: "/admin/media", label: "Media", icon: IconImage, match: (p: string) => p === "/admin/media" },
  { href: "/admin/notifications", label: "Notifications", icon: IconBell, match: (p: string) => p.startsWith("/admin/notifications") },
  { href: "/admin/payments", label: "Payments", icon: IconCard, match: (p: string) => p === "/admin/payments" },
  { href: "/admin/settings", label: "Settings", icon: IconSettings, match: (p: string) => p === "/admin/settings" },
];

const TITLES: [RegExp, string][] = [
  [/^\/admin\/orders\/.+/, "Order details"],
  [/^\/admin\/orders$/, "Orders"],
  [/^\/admin\/reports$/, "Reports"],
  [/^\/admin\/products\/(new|[^/]+)$/, "Product editor"],
  [/^\/admin\/products$/, "Products"],
  [/^\/admin\/categories$/, "Categories"],
  [/^\/admin\/zones$/, "Delivery zones"],
  [/^\/admin\/homepage$/, "Homepage"],
  [/^\/admin\/customers$/, "Customers"],
  [/^\/admin\/shops$/, "Shops"],
  [/^\/admin\/payouts$/, "Payouts"],
  [/^\/admin\/riders$/, "Riders"],
  [/^\/admin\/reviews$/, "Reviews"],
  [/^\/admin\/coupons$/, "Coupons"],
  [/^\/admin\/inventory$/, "Inventory"],
  [/^\/admin\/media$/, "Media"],
  [/^\/admin\/notifications$/, "Notifications"],
  [/^\/admin\/payments$/, "Payments"],
  [/^\/admin\/settings$/, "Settings"],
  [/^\/admin\/staff$/, "Staff"],
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
  const { unread } = useNotifications();
  /** Phones had no way to reach the admin nav: the sidebar simply stacked its
   *  17 links above every page. It is a drawer below `lg` now. */
  const [navOpen, setNavOpen] = useState(false);
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current !== pathname) {
      lastPath.current = pathname;
      setNavOpen(false);
    }
  }, [pathname]);

  // In live mode the mirrored flag may outlast the real session — confirm
  // with the server before deciding anything, and hold the splash until
  // the verdict lands so a valid session never flash-redirects to login.
  const [sessionReady, setSessionReady] = useState(
    () => !isSupabaseConfigured() || getAdminMode() !== "live",
  );
  useEffect(() => {
    // The initial state is already `true` for every path except a live-mode
    // dashboard visit, which is the only one that must wait on the probe.
    // (Fresh staff sign-ins probe once more here — harmless, since the
    // session was verified seconds ago at sign-in.)
    if (onLogin) return;
    if (!isSupabaseConfigured() || getAdminMode() !== "live") return;
    let cancelled = false;
    void refreshStaffSession().then(() => {
      if (!cancelled) setSessionReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [onLogin]);

  useEffect(() => {
    if (!sessionReady) return;
    if (!authed && !onLogin) router.replace("/admin/login");
    if (authed && onLogin) router.replace("/admin");
  }, [authed, onLogin, router, sessionReady]);

  // The login page is public: it renders children regardless of auth and
  // redirects to the dashboard once a session exists.
  if (onLogin) return <>{children}</>;

  if (!authed || !sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-forest-950">
        <div className="flex items-center gap-3 text-ivory-100/80">
          <span className="h-2 w-2 animate-pulse rounded-full bg-gold-400" />
          <span className="text-sm tracking-wide">PROSANTI Admin</span>
        </div>
      </div>
    );
  }

  const sidebar = (
    <>
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
              Backend (next)
            </p>
            <p className="px-3.5 pb-3 text-xs leading-5 text-ivory-100/50">
              SMS/WhatsApp · online gateways
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
    </>
  );

  return (
    <div className="min-h-screen bg-ivory-100/60 lg:flex">
      {/* Sidebar — permanent from lg, drawer below it */}
      <aside className="hidden flex-col bg-forest-950 lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:shrink-0">
        {sidebar}
      </aside>

      <Drawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        label="Admin menu"
        side="left"
        panelBg="bg-forest-950"
        className="lg:hidden"
      >
        {sidebar}
      </Drawer>

      {/* Main column */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-ivory-50/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-10">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open admin menu"
              aria-expanded={navOpen}
              aria-haspopup="dialog"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900 lg:hidden"
            >
              <IconMenu className="h-5 w-5" />
            </button>
            <h1 className="font-display truncate text-lg font-medium text-forest-900 sm:text-xl">
              {titleFor(pathname)}
            </h1>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider ${
                getAdminMode() === "live"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-gold-100 text-gold-700"
              }`}
            >
              {getAdminMode() === "live" ? "Live data" : "Demo data"}
            </span>
          </div>
          <p className="hidden text-sm text-ink-soft sm:block">
            {new Date().toLocaleDateString("en-GB", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </p>
          <Link
            href="/admin/notifications"
            aria-label={`Notifications, ${unread} unread`}
            className="relative flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900"
          >
            <IconBell className="h-5 w-5" />
            {unread > 0 && (
              <span className="absolute right-0 top-0 flex h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full bg-gold-500 px-1 text-[0.62rem] font-bold text-white">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        </header>
        <main className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
