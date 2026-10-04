"use client";

/**
 * The rider app's bottom navigation: five tabs a thumb can reach — Jobs,
 * Earnings, History, Inbox (with an unread badge), Profile. Active state follows the URL; the tab for a
 * nested page (e.g. /rider/earnings/…) stays lit.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBanknote, IconBell, IconClock, IconTruck, IconUser } from "@/components/ui/icons";
import { useRiderInbox } from "@/lib/use-rider-inbox";

export const RIDER_TABS = [
  { href: "/rider", label: "ট্রিপ", Icon: IconTruck },
  { href: "/rider/earnings", label: "আয়", Icon: IconBanknote },
  { href: "/rider/history", label: "ইতিহাস", Icon: IconClock },
  { href: "/rider/inbox", label: "বার্তা", Icon: IconBell },
  { href: "/rider/profile", label: "প্রোফাইল", Icon: IconUser },
] as const;

/** Home is exact; the others match their subtree. */
export const isTabActive = (href: string, pathname: string): boolean =>
  href === "/rider" ? pathname === "/rider" : pathname === href || pathname.startsWith(`${href}/`);

export default function RiderBottomNav() {
  const pathname = usePathname() ?? "";
  // Unread office messages, refreshed once a minute while the app is open.
  const { unread } = useRiderInbox(true, 60_000);
  return (
    <nav
      aria-label="Rider navigation"
      className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md border-t border-line bg-paper/95 backdrop-blur"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-5">
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
                <span className={`relative flex h-7 w-12 items-center justify-center rounded-full ${active ? "bg-forest-100" : ""}`}>
                  <Icon className="h-5 w-5" />
                  {href === "/rider/inbox" && unread > 0 && (
                    <span
                      data-testid="inbox-badge"
                      aria-label={`${unread} অপঠিত বার্তা`}
                      className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white"
                    >
                      {unread > 9 ? "9+" : unread}
                    </span>
                  )}
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
