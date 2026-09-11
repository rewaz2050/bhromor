"use client";

/**
 * Vendor shell + auth gate (marketplace slice 3).
 *
 * The gate is UX only — every /api/vendor/* route re-verifies the session
 * and the vendor_users link server-side. /vendor/login is exempt.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import LogoMark from "@/components/logo-mark";
import { useVendorSession, type VendorMe } from "@/lib/use-vendor";

const VendorCtx = createContext<VendorMe | null>(null);

export const useVendor = (): VendorMe | null => useContext(VendorCtx);

const NAV = [
  { href: "/vendor", label: "Dashboard" },
  { href: "/vendor/orders", label: "Orders" },
  { href: "/vendor/products", label: "Products" },
  { href: "/vendor/earnings", label: "Earnings" },
  { href: "/vendor/settings", label: "Shop settings" },
];

const TITLES: [RegExp, string][] = [
  [/^\/vendor\/orders\/.+/, "Order details"],
  [/^\/vendor\/orders$/, "Orders"],
  [/^\/vendor\/products\/new$/, "New product"],
  [/^\/vendor\/products\/.+/, "Edit product"],
  [/^\/vendor\/products$/, "Products"],
  [/^\/vendor\/earnings$/, "Earnings"],
  [/^\/vendor\/settings$/, "Shop settings"],
  [/^\/vendor$/, "Dashboard"],
];

export default function VendorShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLogin = pathname === "/vendor/login";
  const { me, status, error, signOut } = useVendorSession();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!isLogin && status === "guest") router.replace("/vendor/login");
  }, [isLogin, status, router]);

  if (isLogin) return <>{children}</>;

  if (status === "checking") {
    return (
      <div className="mx-auto max-w-5xl space-y-3 px-4 py-10" aria-label="Loading">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-line/60" />
        <div className="h-24 animate-pulse rounded-2xl bg-line/60" />
        <div className="h-24 animate-pulse rounded-2xl bg-line/60" />
      </div>
    );
  }

  if (status === "guest") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <LogoMark className="mx-auto h-10 w-10" />
        <h1 className="mt-4 font-display text-2xl text-forest-900">
          Vendor sign-in required
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          {error ?? "Please sign in with your vendor account to continue."}
        </p>
        <Link
          href="/vendor/login"
          className="mt-6 inline-flex items-center rounded-xl bg-forest-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-forest-900"
        >
          Go to sign-in
        </Link>
      </div>
    );
  }

  const title = TITLES.find(([re]) => re.test(pathname))?.[1] ?? "Vendor";

  const doSignOut = async () => {
    setSigningOut(true);
    await signOut();
    router.replace("/vendor/login");
  };

  return (
    <VendorCtx.Provider value={me}>
      <div className="min-h-screen bg-cream">
        <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
            <Link href="/vendor" className="flex items-center gap-2">
              <LogoMark className="h-8 w-8" />
              <span className="font-display text-lg text-forest-900">
                {me?.shop.name ?? "Vendor"}
              </span>
            </Link>
            <span className="hidden text-xs text-ink-soft sm:inline">
              {title}
            </span>
            <div className="ml-auto flex items-center gap-2 text-sm">
              <span className="hidden rounded-full bg-cream px-2.5 py-1 text-xs font-medium text-ink-soft ring-1 ring-line md:inline">
                {me?.role === "owner" ? "Owner" : "Staff"} · {me?.email}
              </span>
              <button
                type="button"
                onClick={doSignOut}
                disabled={signingOut}
                className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-soft ring-1 ring-line hover:bg-cream disabled:opacity-60"
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>
          <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 pb-2">
            {NAV.map((item) => {
              const active =
                item.href === "/vendor"
                  ? pathname === "/vendor"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
                    active
                      ? "bg-forest-800 text-white"
                      : "text-ink-soft hover:bg-cream"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </div>
    </VendorCtx.Provider>
  );
}
