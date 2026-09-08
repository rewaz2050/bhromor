"use client";

import { useCart } from "@/components/cart/cart-provider";
import { IconBag } from "@/components/ui/icons";

export default function CartButton() {
  const { itemCount, openBag } = useCart();
  return (
    <button
      type="button"
      onClick={openBag}
      aria-haspopup="dialog"
      aria-label={`Open bag, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
      className="relative flex h-11 items-center justify-center gap-2 rounded-full px-2.5 text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900 xl:px-3"
    >
      <IconBag className="h-[1.18rem] w-[1.18rem]" />
      <span className="hidden text-[0.63rem] font-semibold uppercase tracking-[0.11em] xl:inline">
        Bag
      </span>
      {itemCount > 0 && (
        <span
          key={itemCount}
          className="bag-count-feedback absolute right-0 top-0 flex h-[1.05rem] min-w-[1.05rem] items-center justify-center rounded-full bg-gold-700 px-1 text-[0.62rem] font-bold text-white"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
    </button>
  );
}
