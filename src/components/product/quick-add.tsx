"use client";

import { InlineSizeGuide } from "./size-guide";
import { useState } from "react";
import Link from "next/link";
import type { Product } from "@/lib/catalog";
import { MAX_LINE_QTY } from "@/lib/cart";
import { useCart } from "@/components/cart/cart-provider";
import Drawer from "@/components/ui/drawer";
import { Price } from "@/components/ui/primitives";
import { IconClose } from "@/components/ui/icons";

export default function QuickAdd({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const [size, setSize] = useState(
    product.sizes.length === 1 ? product.sizes[0] : "",
  );
  const [color, setColor] = useState(product.colors[0] ?? "");
  const [qty, setQty] = useState(1);
  const { addItem, openBag } = useCart();
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
            A little everyday comfort
          </p>
          <h2 className="mt-3 font-display text-3xl text-forest-900">
            {product.name}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="flex h-11 w-11 shrink-0 items-center justify-center"
          aria-label="Close product options"
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
            Select size
          </legend>
          <div className="flex flex-wrap gap-2">
            {product.sizes.map((s) => (
              <button
                key={s}
                onClick={() => setSize(s)}
                aria-pressed={size === s}
                className={`min-h-11 min-w-11 border px-4 text-sm ${size === s ? "border-forest-800 bg-forest-800 text-white" : "border-line"}`}
              >
                {s}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <InlineSizeGuide product={product} />
      {product.colors.length > 0 && (
        <fieldset className="mt-5">
          <legend className="mb-3 text-xs uppercase tracking-widest">
            Colour
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
            aria-label="Decrease quantity"
            disabled={qty <= 1}
            onClick={() => setQty(qty - 1)}
            className="h-11 w-11 disabled:opacity-30"
          >
            −
          </button>
          <span aria-live="polite">{qty}</span>
          <button
            aria-label="Increase quantity"
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
          addItem(product.id, variant, qty);
          onClose();
          openBag();
        }}
        className="editorial-button mt-6 w-full justify-center bg-forest-800 text-white disabled:opacity-40"
      >
        {!product.inStock
          ? "Sold out"
          : ready
            ? "Add to Bag →"
            : "Select a size to continue"}
      </button>
      <Link
        href={`/product/${product.slug}`}
        onClick={onClose}
        className="mt-3 flex min-h-11 items-center justify-center text-xs underline underline-offset-4"
      >
        View full details
      </Link>
    </Drawer>
  );
}
