"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { IconBag, IconBox, IconClock, IconHome } from "@/components/ui/icons";
import MobileNav from "./mobile-nav";
import { useLanguage } from "@/components/i18n/language-provider";
import { useCustomer } from "@/lib/use-customer";

export const activeTab = (path: string | null, href: string): boolean => {
  if (!path) return false;
  if (href === "/") return path === "/";
  if (path === href || path.startsWith(`${href}/`)) return true;
  if (href === "/shop") {
    return ["/product", "/shops", "/style", "/campaign", "/live"].some(
      (p) => path === p || path.startsWith(`${p}/`),
    );
  }
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
  return (
    <nav
      aria-label="Quick navigation"
      className="storefront-bottom-nav fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-ivory-50/97 pb-[max(0.35rem,env(safe-area-inset-bottom))] lg:hidden"
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
            className="tap-press flex min-h-16 flex-col items-center justify-center gap-1"
          >
            <span className="tab-icon">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
      <button
        onClick={() => {
          try { navigator.vibrate?.(10); } catch {}
          openBag();
        }}
        aria-label={`Open bag, ${itemCount} items`}
        aria-haspopup="dialog"
        className="tap-press flex min-h-16 flex-col items-center justify-center gap-1"
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
