"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { Product } from "@/lib/catalog";
import { defaultVariant } from "@/lib/cart";
import { useCart } from "@/components/cart/cart-provider";
import { useWishlist } from "@/lib/use-wishlist";
import { Price } from "@/components/ui/primitives";
import { IconCheck, IconHeart, IconPlus } from "@/components/ui/icons";

export default function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();
  const [added, setAdded] = useState(false);
  const wished = has(product.id);

  // Timer cleared on unmount — filtering the grid used to fire setState on
  // cards React had already thrown away.
  const addedTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (addedTimer.current !== null) window.clearTimeout(addedTimer.current);
    },
    [],
  );

  const quickAdd = () => {
    addItem(product.id, defaultVariant(product), 1);
    setAdded(true);
    if (addedTimer.current !== null) window.clearTimeout(addedTimer.current);
    addedTimer.current = window.setTimeout(() => setAdded(false), 1600);
  };

  const secondImage = product.media[1];

  return (
    <article className="group relative flex min-w-0 flex-col">
      <div className="relative overflow-hidden bg-ivory-100">
        <Link
          href={`/product/${product.slug}`}
          className="relative block aspect-[3/4]"
          aria-label={product.name}
        >
          <Image
            src={product.media[0]?.src ?? "/images/hero.jpg"}
            alt={product.media[0]?.alt ?? product.name}
            fill
            sizes="(min-width: 1280px) 300px, (min-width: 1024px) 30vw, 50vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
          {secondImage && (
            <Image
              src={secondImage.src}
              alt=""
              aria-hidden="true"
              fill
              sizes="(min-width: 1280px) 300px, (min-width: 1024px) 30vw, 50vw"
              className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            />
          )}
          {!product.inStock && (
            <span className="absolute inset-0 flex items-center justify-center bg-ivory-50/60 text-sm font-semibold uppercase tracking-[0.2em] text-ink">
              Sold out
            </span>
          )}
        </Link>

        {/* Badges */}
        {product.inStock && product.badge && (
          <div className="absolute left-2 top-2 sm:left-3 sm:top-3">
            <span className="inline-flex bg-paper/95 px-2 py-1.5 text-[0.55rem] font-medium uppercase tracking-[0.12em] text-forest-900 sm:px-3 sm:text-[0.6rem]">
              {product.badge === "new"
                ? "New"
                : product.badge === "sale"
                  ? "Sale"
                  : "Signature"}
            </span>
          </div>
        )}

        {/* Wishlist (§29) — shared store, so the heart follows the customer */}
        <button
          type="button"
          onClick={() => toggle(product.id)}
          aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wished}
          className="absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-full text-forest-900 transition-colors hover:bg-paper/80 hover:text-gold-600 sm:right-2 sm:top-2"
        >
          <IconHeart
            className={`h-[1.05rem] w-[1.05rem] transition-colors ${
              wished ? "fill-gold-500 text-gold-500" : ""
            }`}
          />
        </button>

        {/* Quick add */}
        {product.inStock && (
          <button
            type="button"
            onClick={quickAdd}
            aria-label={`Quick add ${product.name} to cart`}
            className={`absolute inset-x-2 bottom-2 flex min-h-11 items-center justify-center gap-2 px-2 py-2 text-[0.65rem] font-medium uppercase tracking-[0.12em] transition-colors duration-200 sm:inset-x-3 sm:bottom-3 ${
              added
                ? "bg-forest-800 text-ivory-50"
                : "bg-paper/95 text-forest-900 backdrop-blur-sm hover:bg-forest-800 hover:text-ivory-50"
            }`}
          >
            {added ? (
              <>
                <IconCheck className="h-4 w-4" /> Added
              </>
            ) : (
              <>
                <IconPlus className="h-3.5 w-3.5" /> Add to bag
              </>
            )}
          </button>
        )}

        {/* The label swap alone is silent for screen readers. */}
        <p role="status" aria-live="polite" className="sr-only">
          {added ? `${product.name} added to cart` : ""}
        </p>
      </div>

      <div className="mt-4 flex flex-1 flex-col gap-1.5">
        <p className="text-[0.6rem] font-medium uppercase tracking-[0.18em] text-ink-soft">
          {product.subCategory}
        </p>
        <Link
          href={`/product/${product.slug}`}
          className="font-display text-base font-normal leading-snug sm:text-lg text-ink transition-colors hover:text-forest-700"
        >
          {product.name}
        </Link>
        <div className="mt-auto pt-1">
          <Price
            value={product.price}
            compareAt={product.compareAtPrice}
            size="sm"
          />
        </div>
      </div>
    </article>
  );
}
