"use client";

import Link from "next/link";
import { useWishlist } from "@/lib/use-wishlist";
import { IconHeart } from "@/components/ui/icons";

export default function WishlistButton() {
  const { count } = useWishlist();
  return (
    <Link
      href="/wishlist"
      aria-label={`Open wishlist, ${count} saved item${count === 1 ? "" : "s"}`}
      className="relative flex h-11 items-center justify-center gap-2 rounded-full px-2 text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900 sm:px-2.5 xl:px-3"
    >
      <IconHeart className="h-[1.15rem] w-[1.15rem]" />
      <span className="hidden text-[0.63rem] font-semibold uppercase tracking-[0.11em] xl:inline">
        Wishlist
      </span>
      {count > 0 && (
        <span className="absolute right-0 top-0 flex h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full bg-forest-700 px-1 text-[0.62rem] font-bold text-ivory-50">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
