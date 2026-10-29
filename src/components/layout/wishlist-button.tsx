"use client";

import { useLanguage } from "@/components/i18n/language-provider";
import { bnDigits } from "@/lib/arrival";
import Link from "next/link";
import { useWishlist } from "@/lib/use-wishlist";
import { IconHeart } from "@/components/ui/icons";

export default function WishlistButton() {
  const { t, lang } = useLanguage();
  const digits = (n: number) => lang === "bn" ? bnDigits(String(n)) : String(n);
  const { count, ready } = useWishlist();
  return (
    <Link
      href="/wishlist"
      aria-label={ready === false ? t("header.wishlistLoading") : t(count === 1 ? "header.wishlistOne" : "header.wishlistMany").replace("{count}", digits(count))}
      className="header-icon-btn relative flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:text-forest-900"
    >
      <IconHeart className="h-[1.18rem] w-[1.18rem]" />
      {ready !== false && count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-forest-900 px-1 text-[0.64rem] font-bold leading-none text-ivory-50 shadow-sm ring-2 ring-ivory-50">
          {count > 99 ? `${digits(99)}+` : digits(count)}
        </span>
      )}
    </Link>
  );
}
