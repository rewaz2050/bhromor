"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { IconBag, IconBox, IconClock, IconHome } from "@/components/ui/icons";
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

/**
 * Thumb-reach navigation on phones and tablets (§67). Menubar redesign
 * 2026-09-26: the current tab wears a soft pill behind its icon and the bag
 * count is a badge on the icon instead of "(2)" glued to the label.
 */
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
      className="storefront-bottom-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-ivory-50/95 pb-[env(safe-area-inset-bottom)] supports-[backdrop-filter]:bg-ivory-50/85 lg:hidden"
    >
      {[
        { href: "/", label: t("bottomNav.home"), icon: <IconHome className="h-5 w-5" /> },
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
            className="flex min-h-16 flex-col items-center justify-center gap-1"
          >
            <span className="tab-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button
        onClick={openBag}
        aria-label={`Open bag, ${itemCount} items`}
        aria-haspopup="dialog"
        className="flex min-h-16 flex-col items-center justify-center gap-1"
      >
        <span className="tab-icon">
          <IconBag className="h-5 w-5" />
          {itemCount > 0 && (
            <span className="tab-badge" aria-hidden="true">
              {itemCount > 99 ? "99+" : itemCount}
            </span>
          )}
        </span>
        <span>{t("bottomNav.bag")}</span>
      </button>
      <MobileNav bottom />
    </nav>
  );
}
