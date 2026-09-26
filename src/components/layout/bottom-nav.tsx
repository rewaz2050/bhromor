"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { IconBag, IconBox, IconClock } from "@/components/ui/icons";
import MobileNav from "./mobile-nav";
import { useLanguage } from "@/components/i18n/language-provider";
import { useCustomer } from "@/lib/use-customer";

/**
 * Which tab a pathname belongs to. `/` is exact; every other tab also owns
 * its sub-routes, and the Shop tab owns the product/shop detail pages so the
 * bar is never blank while browsing (audit L7).
 */
export const activeTab = (path: string | null, href: string): boolean => {
  if (!path) return false;
  if (href === "/") return path === "/";
  if (path === href || path.startsWith(`${href}/`)) return true;
  if (href === "/shop") {
    return ["/product", "/shops", "/style", "/campaign", "/live"].some(
      (p) => path === p || path.startsWith(`${p}/`),
    );
  }
  // P2 #24 — the Orders tab owns both the tracker and the account page
  // (it points at whichever one the visitor can use).
  if (href === "/track" || href === "/account") {
    return ["/track", "/account", "/returns"].some(
      (p) => path === p || path.startsWith(`${p}/`),
    );
  }
  return false;
};

export default function BottomNav() {
  const { t } = useLanguage();
  const path = usePathname();
  const { openBag, itemCount } = useCart();
  const { customer } = useCustomer();
  const ordersHref = customer ? "/account" : "/track";

  const tabs: {
    href: string;
    label: string;
    icon: React.ReactNode;
    testId?: string;
  }[] = [
    {
      href: "/",
      label: t("bottomNav.home"),
      icon: (
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[1.15rem] w-[1.15rem]"
        >
          <path d="m3 10 9-7 9 7v10H15v-7H9v7H3Z" />
        </svg>
      ),
    },
    {
      href: "/shop",
      label: t("bottomNav.shop"),
      icon: <IconBox className="h-[1.15rem] w-[1.15rem]" />,
    },
    {
      href: ordersHref,
      label: t("bottomNav.orders"),
      icon: <IconClock className="h-[1.15rem] w-[1.15rem]" />,
      testId: "bottom-nav-orders",
    },
  ];

  return (
    <nav
      aria-label="Quick navigation"
      className="storefront-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] lg:hidden"
    >
      {/* Floating glass dock — feels premium, stays reachable */}
      <div className="pointer-events-auto flex w-full max-w-[420px] items-center gap-1 rounded-[22px] border border-line/40 bg-ivory-50/92 p-1.5 shadow-[0_16px_40px_-16px_rgba(12,25,19,0.22),0_4px_16px_-8px_rgba(12,25,19,0.10)] backdrop-blur-xl supports-[backdrop-filter]:bg-ivory-50/78">
        {tabs.map((item) => {
          const active = activeTab(path, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              data-testid={item.testId}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] px-1 py-2 text-[10px] font-medium leading-none tracking-wide transition-all duration-300 ${
                active
                  ? "bg-forest-900 text-ivory-50 shadow-sm"
                  : "text-ink-soft hover:bg-forest-50 hover:text-forest-900"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
                  active ? "bg-white/12" : ""
                }`}
              >
                {item.icon}
              </span>
              <span className={active ? "font-semibold" : ""}>{item.label}</span>
            </Link>
          );
        })}

        <button
          onClick={openBag}
          aria-label={`Open bag, ${itemCount} items`}
          aria-haspopup="dialog"
          className="relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] px-1 py-2 text-[10px] font-medium leading-none tracking-wide text-ink-soft transition-colors hover:bg-forest-50 hover:text-forest-900"
        >
          <span className="relative flex h-6 w-6 items-center justify-center">
            <IconBag className="h-[1.15rem] w-[1.15rem]" />
            {itemCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-600 px-1 text-[0.58rem] font-bold leading-none text-white ring-2 ring-ivory-50">
                {itemCount > 99 ? "99+" : itemCount}
              </span>
            )}
          </span>
          <span className="flex items-center gap-1">
            {t("bottomNav.bag")}
            {itemCount > 0 && (
              <span className="rounded-full bg-gold-500/15 px-1 py-0.5 text-[0.58rem] font-bold leading-none text-gold-700">
                {itemCount}
              </span>
            )}
          </span>
        </button>

        <div className="flex flex-1 flex-col items-center justify-center">
          <MobileNav bottom />
        </div>
      </div>
    </nav>
  );
}
