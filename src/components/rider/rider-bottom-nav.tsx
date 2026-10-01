"use client";

/**
 * The rider app's bottom navigation: four tabs a thumb can reach — Jobs,
 * Earnings, History, Profile. Active state follows the URL; the tab for a
 * nested page (e.g. /rider/earnings/…) stays lit.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBanknote, IconClock, IconTruck, IconUser } from "@/components/ui/icons";

export const RIDER_TABS = [
  { href: "/rider", label: "ট্রিপ", Icon: IconTruck },
  { href: "/rider/earnings", label: "আয়", Icon: IconBanknote },
  { href: "/rider/history", label: "ইতিহাস", Icon: IconClock },
  { href: "/rider/profile", label: "প্রোফাইল", Icon: IconUser },
] as const;

/** Home is exact; the others match their subtree. */
export const isTabActive = (href: string, pathname: string): boolean =>
  href === "/rider" ? pathname === "/rider" : pathname === href || pathname.startsWith(`${href}/`);

export default function RiderBottomNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Rider navigation"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-line bg-paper/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-4">
        {RIDER_TABS.map(({ href, label, Icon }) => {
          const active = isTabActive(href, pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
                  active ? "text-forest-900" : "text-ink-soft hover:text-forest-800"
                }`}
              >
                <span className={`flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-forest-100" : ""}`}>
                  <Icon className="h-5 w-5" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
