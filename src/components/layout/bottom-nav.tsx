"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { IconBag, IconHeart, IconBox } from "@/components/ui/icons";
import MobileNav from "./mobile-nav";
import { useLanguage } from "@/components/i18n/language-provider";

export default function BottomNav() {
  const { t } = useLanguage();
  const path = usePathname();
  const { openBag, itemCount } = useCart();
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
          href: "/wishlist",
          label: t("bottomNav.wishlist"),
          icon: <IconHeart className="h-5 w-5" />,
        },
      ].map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={path === item.href ? "page" : undefined}
          className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] ${path === item.href ? "text-forest-900" : "text-ink-soft"}`}
        >
          {item.icon}
          {item.label}
        </Link>
      ))}
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
