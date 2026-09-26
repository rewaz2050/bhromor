"use client";

/**
 * Sticky bag mini-bar on listing pages (UX plan §1.3, 2026-09-26).
 *
 * Phones only. While the bag has pieces and the shopper is browsing a
 * listing (/shop, a shop page, campaigns, wishlist…), a slim bar sits above
 * the bottom nav: "৩টি পণ্য · ৳১,২৫০" (tap → bag drawer) and "চেকআউট →".
 * It stays out of the way on the product page (which has its own buy bar),
 * the bag/checkout pages themselves, and whenever the drawer is open.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "@/components/cart/cart-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconBag } from "@/components/ui/icons";
import { bnDigits } from "@/lib/arrival";
import { formatBdt } from "@/lib/format";

const LISTING_PREFIXES = ["/shop", "/shops", "/campaign", "/wishlist", "/live", "/style"];

export const showsBagMiniBar = (pathname: string | null): boolean => {
  if (!pathname) return false;
  return LISTING_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`) || pathname.startsWith(`${p}?`));
};

export default function BagMiniBar() {
  const pathname = usePathname();
  const { detail, subtotal, ready, bagOpen, openBag } = useCart();
  const { t, lang } = useLanguage();
  const count = detail.reduce((n, l) => n + l.qty, 0);
  const visible = ready && count > 0 && !bagOpen && showsBagMiniBar(pathname);
  if (!visible) return null;
  const countLabel = `${lang === "bn" ? bnDigits(String(count)) : count}${lang === "bn" ? "" : " "}${
    count === 1 ? t("cart.item") : t("cart.items")
  }`;
  const total = lang === "bn" ? bnDigits(formatBdt(subtotal)) : formatBdt(subtotal);
  return (
    <div
      data-testid="bag-mini-bar"
      className="bag-mini-bar fixed inset-x-3 z-30 flex items-stretch gap-2 rounded-2xl bg-forest-950/95 p-1.5 text-ivory-50 shadow-lg ring-1 ring-forest-800 backdrop-blur supports-[backdrop-filter]:bg-forest-950/90 lg:hidden"
      style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom))" }}
    >
      <button
        type="button"
        onClick={openBag}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 text-left hover:bg-forest-900"
        aria-label={t("bag.viewBag")}
      >
        <IconBag className="h-4 w-4 shrink-0 text-gold-300" />
        <span className="truncate text-sm font-semibold">
          {countLabel} · {total}
        </span>
      </button>
      <Link
        href="/checkout"
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gold-400 px-4 text-sm font-bold text-forest-950 hover:bg-gold-300"
      >
        {t("bag.checkout")}
      </Link>
    </div>
  );
}
