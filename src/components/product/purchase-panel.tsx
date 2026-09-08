"use client";

import SizeGuide from "./size-guide";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { MAX_LINE_QTY } from "@/lib/cart";
import { useCart } from "@/components/cart/cart-provider";
import { Price, Rating } from "@/components/ui/primitives";
import {
  IconCheck,
  IconMapPin,
  IconMinus,
  IconPlus,
  IconShield,
  IconTruck,
} from "@/components/ui/icons";

export default function PurchasePanel({ product }: { product: Product }) {
  const { addItem, openBag } = useCart();
  const router = useRouter();

  const hasSizes =
    product.sizes.length > 1 || !/free|one size/i.test(product.sizes[0] ?? "");
  const [color, setColor] = useState(product.colors[0] ?? "");
  const [size, setSize] = useState(
    product.sizes.length === 1 ? product.sizes[0] : "",
  );
  const [qty, setQty] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);

  /** Join only the parts that exist — colourless products used to produce
   *  a label like " · L" with a dangling separator. */
  const variantLabel =
    [color, hasSizes ? size : ""].filter(Boolean).join(" · ") || "Default";

  const feedbackTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (feedbackTimer.current !== null)
        window.clearTimeout(feedbackTimer.current);
    },
    [],
  );

  const addedFeedback = () => {
    setFeedback(`Added to cart — ${formatBdt(product.price * qty)}`);
    if (feedbackTimer.current !== null)
      window.clearTimeout(feedbackTimer.current);
    feedbackTimer.current = window.setTimeout(() => setFeedback(null), 2600);
  };

  const handleAdd = () => {
    addItem(product.id, variantLabel, qty);
    addedFeedback();
    openBag();
  };

  const handleBuyNow = () => {
    addItem(product.id, variantLabel, qty);
    router.push("/checkout");
  };

  return (
    <div className="purchase-panel">
      <p className="text-[0.72rem] font-medium uppercase tracking-[0.24em] text-ink-soft">
        {product.category} · {product.subCategory}
      </p>
      <h1 className="font-display mt-2 text-3xl font-medium leading-tight tracking-tight text-forest-900 sm:text-4xl">
        {product.name}
        {product.nameBn && (
          <span className="font-bengali mt-1 block text-base font-normal text-ink-soft">
            {product.nameBn}
          </span>
        )}
      </h1>

      <div className="mt-3">
        <Rating value={product.rating} reviewCount={product.reviewCount} />
      </div>

      <div className="mt-5">
        <Price
          value={product.price}
          compareAt={product.compareAtPrice}
          size="lg"
        />
        {product.compareAtPrice && product.compareAtPrice > product.price && (
          <p className="mt-2 text-sm font-medium text-forest-700">
            Save {formatBdt(product.compareAtPrice - product.price)}
          </p>
        )}
        <p className="mt-1 text-xs text-ink-soft">
          Price is inclusive of VAT. Delivery charge calculated at checkout by
          area.
        </p>
      </div>

      <p className="mt-6 max-w-lg leading-7 text-ink-soft">
        {product.shortDescription}
      </p>

      {/* Stock note */}
      <div className="mt-5 flex items-center gap-2 text-sm">
        {product.inStock ? (
          <>
            <span className="h-2 w-2 rounded-sm bg-forest-500" />
            <span className="text-forest-800">In stock</span>
            {product.lowStock && (
              <span className="text-ink-soft">
                — only a few left in this size
              </span>
            )}
          </>
        ) : (
          <>
            <span className="h-2 w-2 rounded-sm bg-gold-500" />
            <span className="text-gold-700">Sold out — check back soon</span>
          </>
        )}
      </div>

      {/* Colour */}
      {product.colors.length > 0 && (
        <div className="mt-7">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-ink-soft">
            Colour
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {product.colors.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-pressed={color === c}
                className={`rounded-sm px-4 py-2 text-sm transition-colors ${
                  color === c
                    ? "bg-forest-800 font-medium text-ivory-50"
                    : "bg-paper text-ink-soft ring-1 ring-line hover:ring-forest-400"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Size */}
      <div className="mt-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-ink-soft">
            Size
          </p>
          <SizeGuide product={product} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {product.sizes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              aria-pressed={size === s}
              className={`h-11 min-w-11 rounded-sm px-4 text-sm transition-colors ${
                size === s
                  ? "bg-forest-800 font-semibold text-ivory-50"
                  : "bg-paper text-ink-soft ring-1 ring-line hover:ring-forest-400"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Quantity + CTAs */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex h-14 items-center justify-between rounded-sm bg-paper px-2 ring-1 ring-line sm:w-36">
          <button
            type="button"
            onClick={() => setQty((n) => Math.max(1, n - 1))}
            disabled={qty <= 1}
            aria-label="Decrease quantity"
            className="flex h-10 w-10 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconMinus className="h-4 w-4" />
          </button>
          <span className="text-sm font-semibold text-ink" aria-live="polite">
            {qty}
          </span>
          <button
            type="button"
            onClick={() => setQty((n) => Math.min(MAX_LINE_QTY, n + 1))}
            disabled={qty >= MAX_LINE_QTY}
            aria-label="Increase quantity"
            className="flex h-10 w-10 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-forest-100 hover:text-forest-900 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <IconPlus className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={handleAdd}
          className="h-14 flex-1 rounded-sm bg-forest-800 px-8 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-40"
          disabled={!product.inStock || (product.sizes.length > 0 && !size)}
        >
          {product.sizes.length > 0 && !size ? "Select a size" : "Add to Bag"}
        </button>
        <button
          type="button"
          onClick={handleBuyNow}
          className="h-14 flex-1 rounded-sm bg-gold-500 px-8 text-sm font-semibold text-forest-950 transition-colors hover:bg-gold-400 disabled:opacity-40"
          disabled={!product.inStock || (product.sizes.length > 0 && !size)}
        >
          Buy Now
        </button>
      </div>

      {feedback && (
        <p
          role="status"
          aria-live="polite"
          className="mt-4 inline-flex items-center gap-2 rounded-sm bg-forest-100 px-4 py-2 text-sm font-medium text-forest-900"
        >
          <IconCheck className="h-4 w-4" /> {feedback}
        </p>
      )}

      {/* Delivery trust card */}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        <TrustPill
          icon={IconTruck}
          title="45–50 min"
          text="Rapid delivery in the service area"
        />
        <TrustPill
          icon={IconMapPin}
          title="Zone-based charge"
          text="৳50 – ৳130, shown before you pay"
        />
        <TrustPill
          icon={IconShield}
          title="COD available"
          text="Pay when it reaches your door"
        />
      </div>
    </div>
  );
}

function TrustPill({
  icon: Icon,
  title,
  text,
}: {
  icon: (p: { className?: string }) => React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-md bg-ivory-100 p-4 ring-1 ring-line">
      <Icon className="h-5 w-5 text-forest-700" />
      <p className="mt-2.5 text-sm font-semibold text-ink">{title}</p>
      <p className="mt-1 text-xs leading-5 text-ink-soft">{text}</p>
    </div>
  );
}
