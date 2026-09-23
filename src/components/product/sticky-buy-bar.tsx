"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { coverImage, type Product } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { useFlashPrice } from "@/lib/use-promos";
import { IconBag } from "@/components/ui/icons";

/**
 * The sticky buy bar (phones): when the real add-to-bag panel has scrolled
 * out of view, a compact photo + price + "Add to bag" dock appears at the
 * bottom edge. Tapping it scrolls back to the purchase panel — one honest
 * CTA, never a second one that could drift out of sync with size/stock.
 */

export default function StickyBuyBar({
  product,
  targetId = "purchase-panel",
}: {
  product: Product;
  targetId?: string;
}) {
  const cover = coverImage(product);
  const flash = useFlashPrice(product);
  const shown = flash.was === null ? product.price : flash.price;
  const [panelGone, setPanelGone] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setPanelGone(!entry.isIntersecting),
      { rootMargin: "-72px 0px 0px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  const scrollToPanel = () => {
    document
      .getElementById(targetId)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div
      data-testid="sticky-buy-bar"
      data-visible={panelGone}
      className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-paper/95 backdrop-blur-sm transition-transform duration-200 lg:hidden ${
        panelGone ? "translate-y-0" : "translate-y-full"
      }`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-hidden={!panelGone}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-ivory-100 ring-1 ring-line">
          <Image
            src={cover.src}
            alt=""
            fill
            sizes="48px"
            className="object-cover"
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">
            {product.name}
          </span>
          <span className="flex items-baseline gap-2 text-sm">
            <span className="font-semibold text-forest-900">
              {formatBdt(shown)}
            </span>
            {flash.was !== null && (
              <s className="text-xs text-ink-soft">{formatBdt(flash.was)}</s>
            )}
          </span>
        </span>
        <button
          type="button"
          onClick={scrollToPanel}
          tabIndex={panelGone ? 0 : -1}
          className="tap-press inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-forest-800 px-5 text-sm font-semibold text-ivory-50 hover:bg-forest-700"
        >
          <IconBag className="h-4 w-4" />
          Add
        </button>
      </div>
    </div>
  );
}
