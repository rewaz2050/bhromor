"use client";

import { useProductHref } from "@/lib/use-product-href";
import { InlineSizeGuide } from "./size-guide";
import { useState } from "react";
import { haptic } from "@/lib/haptics";
import Link from "next/link";
import type { Product } from "@/lib/catalog";
import { MAX_LINE_QTY } from "@/lib/cart";
import { useCart } from "@/components/cart/cart-provider";
import ShopConflictDialog from "@/components/cart/shop-conflict-dialog";
import { useGuardedAdd } from "@/lib/use-guarded-add";
import Drawer from "@/components/ui/drawer";
import { Price } from "@/components/ui/primitives";
import { IconClose } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";
import { pickSelectableSize, sizeAvailability, sizeLeftLabel } from "@/lib/size-stock";

export default function QuickAdd({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const { t, lang } = useLanguage();
  const hrefFor = useProductHref();
  const [size, setSize] = useState(() => pickSelectableSize(product, null));
  const [color, setColor] = useState(product.colors[0] ?? "");
  const [qty, setQty] = useState(1);
  const { openBag } = useCart();
  const { add, conflict, confirmConflict, dismissConflict } = useGuardedAdd("card");
  const ready = product.inStock && (product.sizes.length === 0 || !!size);
  return (
    <Drawer
      open
      onClose={onClose}
      label={`Select options for ${product.name}`}
      side="bottom"
      panelClassName="sm:!left-auto sm:!w-[480px] sm:!right-6 sm:!bottom-6 sm:rounded-none"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-gold-600">
            {t("product.quickAddIntro")}
          </p>
          <h2 className="mt-3 font-display text-3xl text-forest-900">
            {product.name}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center"
          aria-label={t("header.closeMenu")}
        >
          <IconClose />
        </button>
      </div>
      <div className="mt-4">
        <Price value={product.price} compareAt={product.compareAtPrice} />
      </div>
      {product.sizes.length > 0 && (
        <fieldset className="mt-7">
          <legend className="mb-3 text-xs uppercase tracking-widest">
            {t("shopBrowser.size")}
          </legend>
          <div className="flex flex-wrap gap-x-2 gap-y-5">
            {product.sizes.map((s) => {
              // UX plan §4 (R10): a sold-out size is disabled here — the
              // sheet is for a quick add; the product page carries the
              // "ask the shop" path for that size.
              const avail = sizeAvailability(product, s);
              const out = avail.state === "out";
              return (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  disabled={out}
                  aria-pressed={size === s}
                  aria-label={
                    out
                      ? `${s} — ${t("purchase.soldOut")}`
                      : avail.state === "low" && avail.available !== null
                        ? `${s} — ${sizeLeftLabel(avail.available, lang)}`
                        : undefined
                  }
                  data-size-stock={avail.state}
                  className={`relative min-h-11 min-w-11 border px-4 text-sm ${
                    size === s
                      ? "border-forest-800 bg-forest-800 text-white"
                      : out
                        ? "border-line/60 text-ink-soft/50 line-through"
                        : "border-line"
                  }`}
                >
                  {s}
                  {avail.state === "low" && avail.available !== null ? (
                    <span aria-hidden="true" className="absolute -bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[0.6rem] font-semibold text-rose-700">
                      {sizeLeftLabel(avail.available, lang)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}
      <InlineSizeGuide product={product} />
      {product.colors.length > 0 && (
        <fieldset className="mt-5">
          <legend className="mb-3 text-xs uppercase tracking-widest">
            {t("shopBrowser.colour")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {product.colors.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                className={`min-h-11 border px-4 text-sm ${color === c ? "border-forest-800 bg-forest-100" : "border-line"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <div className="mt-7 flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest">Quantity</span>
        <div className="flex items-center border border-line">
          <button
            aria-label={t("product.decreaseQuantity")}
            disabled={qty <= 1}
            onClick={() => setQty(qty - 1)}
            className="h-11 w-11 disabled:opacity-30"
          >
            −
          </button>
          <span aria-live="polite">{qty}</span>
          <button
            aria-label={t("product.increaseQuantity")}
            disabled={qty >= MAX_LINE_QTY}
            onClick={() => setQty(qty + 1)}
            className="h-11 w-11 disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>
      <button
        disabled={!ready}
        onClick={() => {
          const variant =
            [color, /^(free|one) size$/i.test(size) && color ? "" : size]
              .filter(Boolean)
              .join(" · ") || "Default";
          if (add(product, variant, qty)) {
            haptic("tap");
            onClose();
            openBag();
          }
        }}
        className="editorial-button mt-6 w-full justify-center bg-forest-800 text-white disabled:opacity-40"
      >
        {!product.inStock
          ? t("product.soldOut")
          : ready
            ? t("product.addToBag")
            : t("product.selectSize")}
      </button>
      <Link
        href={hrefFor(product)}
        onClick={onClose}
        className="mt-3 flex min-h-11 items-center justify-center text-xs underline underline-offset-4"
      >
        View full details
      </Link>
      {conflict && (
        <ShopConflictDialog
          fromShop={conflict.fromShopName}
          toShop={conflict.toShopName}
          onKeep={dismissConflict}
          onStartNew={() => {
            confirmConflict();
            onClose();
            openBag();
          }}
        />
      )}
    </Drawer>
  );
}
