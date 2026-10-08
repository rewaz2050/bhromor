"use client";

import { useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/cart-provider";
import { IconBag } from "@/components/ui/icons";

/**
 * The bag button. Its badge must celebrate a CHANGE, not a page load: the
 * old key-per-count trick replayed `bag-pop` whenever the number changed,
 * which included the moment the stored bag is read — so a shopper with three
 * items watched the badge bounce on every single page (flicker pass
 * 2026-10-07). The animation now arms itself only once the bag is known and
 * the count genuinely moves afterwards.
 */
export default function CartButton() {
  const { itemCount, openBag, ready } = useCart();
  const [pops, setPops] = useState(0);
  const seen = useRef<number | null>(null);

  useEffect(() => {
    if (!ready) {
      // The stored bag has not been read yet — that number is not news.
      seen.current = null;
      return;
    }
    if (seen.current !== null && seen.current !== itemCount) {
      setPops((p) => p + 1);
    }
    seen.current = itemCount;
  }, [ready, itemCount]);

  return (
    <button
      type="button"
      onClick={openBag}
      aria-haspopup="dialog"
      aria-label={`Open bag, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
      className="header-icon-btn relative flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:text-forest-900"
    >
      {/* key per change — the CSS bag-pop replays when the shopper adds. */}
      <span
        key={`icon-${pops}`}
        className={pops > 0 ? "bag-pop flex" : "flex"}
      >
        <IconBag className="h-[1.2rem] w-[1.2rem]" />
      </span>
      {itemCount > 0 && (
        <span
          key={`count-${pops}`}
          className="bag-count-feedback absolute -right-0.5 -top-0.5 flex h-[1.15rem] min-w-[1.15rem] items-center justify-center rounded-full bg-gold-600 px-1 text-[0.64rem] font-bold leading-none text-white shadow-sm ring-2 ring-ivory-50"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      )}
    </button>
  );
}
