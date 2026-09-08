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
      className="header-icon-btn relative flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:text-forest-900"
    >
      <IconBag className="h-[1.2rem] w-[1.2rem]" />
      {itemCount > 0 && (
        <span
          key={itemCount}
          className="bag-count-feedback absolute -right-0.5 -top-0.5 flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-gold-600 px-1 text-[0.64rem] font-bold leading-none text-white shadow-sm ring-2 ring-ivory-50"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
    </button>
  );
}
