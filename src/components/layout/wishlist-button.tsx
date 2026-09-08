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
      className="relative flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900"
    >
      <IconHeart className="h-[1.2rem] w-[1.2rem]" />
      {count > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full bg-forest-700 px-1 text-[0.62rem] font-bold text-ivory-50">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
