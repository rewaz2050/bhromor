"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import type { Product } from "@/lib/catalog";
import { defaultVariant } from "@/lib/cart";
import { useCart } from "@/components/cart/cart-provider";
import { useWishlist } from "@/lib/use-wishlist";
import { Badge, Price } from "@/components/ui/primitives";
import { IconCheck, IconHeart, IconPlus } from "@/components/ui/icons";

export default function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const { has, toggle } = useWishlist();
  const [added, setAdded] = useState(false);
  const wished = has(product.id);

  const quickAdd = () => {
    addItem(product.id, defaultVariant(product), 1);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  };

  const secondImage = product.media[1];

  return (
    <article className="group relative flex flex-col">
      <div className="relative overflow-hidden rounded-2xl bg-ivory-100 ring-1 ring-line transition-shadow duration-300 group-hover:shadow-[0_18px_40px_-24px_rgba(12,25,19,0.5)]">
        <Link
          href={`/product/${product.slug}`}
          className="relative block aspect-[4/5]"
          aria-label={product.name}
        >
          <Image
            src={product.media[0].src}
            alt={product.media[0].alt}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
          />
          {secondImage && (
            <Image
              src={secondImage.src}
              alt={secondImage.alt}
              fill
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
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
          <div className="absolute left-3 top-3">
            <Badge kind={product.badge} />
          </div>
        )}

        {/* Wishlist (§29) — shared store, so the heart follows the customer */}
        <button
          type="button"
          onClick={() => toggle(product.id)}
          aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wished}
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-paper/90 text-ink-soft shadow-sm ring-1 ring-line backdrop-blur transition-colors hover:text-gold-600"
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
            className={`absolute bottom-3 right-3 flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold shadow-lg transition-all duration-200 ${
              added
                ? "bg-forest-800 text-ivory-50"
                : "bg-paper text-forest-900 ring-1 ring-line hover:bg-forest-800 hover:text-ivory-50"
            }`}
          >
            {added ? (
              <>
                <IconCheck className="h-4 w-4" /> Added
              </>
            ) : (
              <>
                <IconPlus className="h-4 w-4" /> Add
              </>
            )}
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-1 px-0.5">
        <p className="text-[0.7rem] font-medium uppercase tracking-[0.22em] text-ink-soft">
          {product.subCategory}
        </p>
        <Link
          href={`/product/${product.slug}`}
          className="font-display text-[1.05rem] font-medium leading-snug text-ink transition-colors hover:text-forest-700"
        >
          {product.name}
        </Link>
        <div className="mt-1">
          <Price value={product.price} compareAt={product.compareAtPrice} />
        </div>
      </div>
    </article>
  );
}
