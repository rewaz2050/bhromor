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
  // P2 #24 — "অর্ডার" replaces Wishlist in the thumb bar: a signed-in
  // customer lands on the account's order history, a guest on the tracker
  // (which remembers the last order on this device). Wishlist stays in the
  // header (sm+) and the menu.
  const { customer } = useCustomer();
  const ordersHref = customer ? "/account" : "/track";
  return (
    <nav
      aria-label="Quick navigation"
      className="storefront-bottom-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-ivory-50 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {[
        {
          href: "/",
          label: t("bottomNav.home"),
          icon: (
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              <path d="m3 10 9-7 9 7v10H15v-7H9v7H3Z" />
            </svg>
          ),
        },
        { href: "/shop", label: t("bottomNav.shop"), icon: <IconBox className="h-5 w-5" /> },
        {
          href: ordersHref,
          label: t("bottomNav.orders"),
          icon: <IconClock className="h-5 w-5" />,
          testId: "bottom-nav-orders",
        },
      ].map((item) => {
        const active = activeTab(path, item.href);
        return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active ? "page" : undefined}
          data-testid={"testId" in item ? item.testId : undefined}
          className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] ${active ? "text-forest-900" : "text-ink-soft"}`}
        >
          {item.icon}
          {item.label}
        </Link>
        );
      })}
      <button
        onClick={openBag}
        aria-label={`Open bag, ${itemCount} items`}
        aria-haspopup="dialog"
        className="flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] text-ink-soft"
      >
        <IconBag className="h-5 w-5" />
        {t("bottomNav.bag")}{itemCount > 0 ? ` (${itemCount})` : ""}
      </button>
      <MobileNav bottom />
    </nav>
  );
}
