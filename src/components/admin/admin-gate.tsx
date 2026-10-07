"use client";

/**
 * Admin shell + auth gate (§47, §101).
 *
 * Route guard is enforced here for the admin UI; the blueprint requires the
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
import { useApplicationsPending } from "@/lib/use-applications-pending";
import { useStaffLive } from "@/lib/use-staff-live";
import { useNow } from "@/lib/use-now";
import AdminDataError from "@/components/admin/admin-data-error";
import {
  IconBell,
  IconExternal,
  IconLogout,
  IconMenu,
  IconSearch,
} from "@/components/ui/icons";
import AdminSidebarNav, {
  type AdminQueueCounts,
} from "@/components/admin/admin-sidebar-nav";
import AdminCommandPalette from "@/components/admin/command-palette";
import { adminTitleFor } from "@/components/admin/admin-nav";
import {
  getAdminAuthed,
  ADMIN_LOGIN_PATH,
  refreshStaffSession,
  signOutAdmin,
  subscribeAdminAuth,
} from "@/lib/admin-auth";
import { isSupabaseConfigured } from "@/lib/env";

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

  const onLogin = pathname.startsWith(ADMIN_LOGIN_PATH);
  const { unread } = useNotifications();
  // Apply = sign up (2026-09-26): new shop / rider applications wait for a
  // human Approve, so their count sits on the two queue links.
  const applications = useApplicationsPending();
  const queueCounts: AdminQueueCounts = {
    shops: applications.shops,
    riders: applications.riders,
    resets: applications.resets,
  };
  // Header date: a clock read in render is impure (hydration mismatch and a
  // date that never rolls over on a tab left open past midnight).
  const now = useNow(60_000);
  // The shared staff probe every data hook waits on. When it fails (server
  // unreachable, session not seen, not staff) the pages below would render
  // empty lists as if the shop had no data — say why, once, up here.
  const staffLive = useStaffLive();
  /** Phones had no way to reach the admin nav: the sidebar simply stacked its
   *  26 links above every page. It is a drawer below `lg` now. */
  const [navOpen, setNavOpen] = useState(false);
  /** ⌘K / Ctrl+K palette — the shortcut past the grouped sidebar. */
  const [paletteOpen, setPaletteOpen] = useState(false);
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
    () => !isSupabaseConfigured(),
  );
  useEffect(() => {
    // The initial state is already `true` for every path except a live-mode
    // dashboard visit, which is the only one that must wait on the probe.
    // (Fresh staff sign-ins probe once more here — harmless, since the
    // session was verified seconds ago at sign-in.)
    if (onLogin) return;
    if (!isSupabaseConfigured()) return;
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
    if (!authed && !onLogin) router.replace(ADMIN_LOGIN_PATH);
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

        <AdminSidebarNav
          pathname={pathname}
          counts={queueCounts}
          onNavigate={() => setNavOpen(false)}
        />

        <div className="px-6 pb-4">
          <p className="pb-1 text-[0.6rem] uppercase tracking-[0.28em] text-ivory-100/40">
            Backend (next)
          </p>
          <p className="text-xs leading-5 text-ivory-100/50">
            SMS/WhatsApp · online gateways
          </p>
        </div>
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
              router.replace(ADMIN_LOGIN_PATH);
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

      <AdminCommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onOpen={() => setPaletteOpen(true)}
        pathname={pathname}
        counts={queueCounts}
      />

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
              {adminTitleFor(pathname)}
            </h1>
            <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-[0.65rem] font-bold uppercase tracking-wider text-emerald-800">
              Live data
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-keyshortcuts="Meta+K Control+K"
              className="flex h-10 items-center gap-2 rounded-full border border-line bg-paper px-3 text-sm text-ink-soft transition-colors hover:border-forest-300 hover:text-forest-900"
            >
              <IconSearch className="h-4 w-4" />
              <span className="hidden lg:inline">Jump to…</span>
              <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[0.65rem] font-semibold lg:inline">
                ⌘K
              </kbd>
              <span className="sr-only">Search admin pages</span>
            </button>
            <p className="hidden text-sm text-ink-soft sm:block">
              {new Date(now).toLocaleDateString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          </div>
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
          {staffLive.checked && !staffLive.live && staffLive.error ? (
            <div className="mb-6">
              <AdminDataError
                label="Live data unavailable"
                error={staffLive.error}
                onRetry={staffLive.retry}
              />
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}
