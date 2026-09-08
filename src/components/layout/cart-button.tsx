"use client";

import Link from "next/link";
import { useCart } from "@/components/cart/cart-provider";
import { IconBag } from "@/components/ui/icons";

export default function CartButton() {
  const { itemCount } = useCart();
  return (
    <Link
      href="/cart"
      aria-label={`Open cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
      className="relative flex h-11 w-11 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900"
    >
      <IconBag className="h-[1.2rem] w-[1.2rem]" />
      {itemCount > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full bg-gold-500 px-1 text-[0.62rem] font-bold text-white">
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
    </Link>
  );
}
