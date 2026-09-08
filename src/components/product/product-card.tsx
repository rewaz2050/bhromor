"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/lib/catalog";
import { useTransientValue } from "@/lib/use-transient-value";
import { useWishlist } from "@/lib/use-wishlist";
import { Price } from "@/components/ui/primitives";
import { IconArrowRight, IconHeart, IconPlus } from "@/components/ui/icons";
import QuickAdd from "./quick-add";

/**
 * Product names read more like a fashion line when the garment type and the
 * style name have their own hierarchy: “Panjabi / Heritage Green”.
 */
export function editorialProductName(product: Product): string {
  const name = product.name.trim();
  const type = product.subCategory.trim();
  const lowerName = name.toLocaleLowerCase();
  const lowerType = type.toLocaleLowerCase();

  if (lowerName.endsWith(` ${lowerType}`)) {
    return name.slice(0, -(type.length + 1));
  }
  if (lowerName.startsWith(`${lowerType} `)) {
    return name.slice(type.length + 1);
  }
  return name;
}

export default function ProductCard({ product }: { product: Product }) {
  const { has, toggle, ready, busy } = useWishlist();
  const [quickOpen, setQuickOpen] = useState(false);
  const [notice, setNotice] = useTransientValue("");
  const wished = has(product.id);
  const secondImage = product.media[1];
  const styleName = editorialProductName(product);

  return (
    <article className="product-card group relative flex min-w-0 flex-col">
      <div className="product-card-media relative overflow-hidden bg-ivory-100">
        <Link
          href={`/product/${product.slug}`}
          className="relative block aspect-[4/5]"
          aria-label={`View ${product.name}`}
        >
          <Image
            src={product.media[0]?.src ?? "/images/hero.jpg"}
            alt={product.media[0]?.alt ?? product.name}
            fill
            sizes="(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 72vw"
            className="product-image-primary object-cover"
          />
          {secondImage && (
            <Image
              src={secondImage.src}
              alt=""
              aria-hidden="true"
              fill
              sizes="(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 72vw"
              className="product-image-secondary absolute inset-0 h-full w-full object-cover opacity-0"
            />
          )}
          {!product.inStock && (
            <span className="absolute inset-0 flex items-center justify-center bg-ivory-50/70 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-forest-950 backdrop-blur-[1px]">
              Sold out
            </span>
          )}
        </Link>

        <button
          type="button"
          onClick={async () => {
            const saved = await toggle(product.id);
            setNotice(
              saved
                ? wished
                  ? "Removed from wishlist"
                  : "Added to wishlist"
                : "Could not sync wishlist. Please retry from your account.",
            );
          }}
          disabled={!ready || busy}
          aria-label={wished ? "Remove from wishlist" : "Add to wishlist"}
          aria-pressed={wished}
          className="product-heart absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-forest-900 transition-colors hover:bg-paper hover:text-gold-700"
        >
          <IconHeart
            className={`h-[1.05rem] w-[1.05rem] transition-colors ${
              wished ? "wishlist-feedback fill-gold-500 text-gold-500" : ""
            }`}
          />
        </button>

        {product.inStock && (
          <div className="product-card-actions absolute inset-x-2 bottom-2 grid grid-cols-1 gap-1.5 sm:inset-x-3 sm:bottom-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              aria-label={`Quick add ${product.name} to cart`}
              className="product-quick-add flex min-h-11 items-center justify-center gap-2 bg-forest-950/94 px-3 py-2 text-[0.61rem] font-semibold uppercase tracking-[0.12em] text-ivory-50 backdrop-blur-sm hover:bg-forest-800"
            >
              <IconPlus className="h-3.5 w-3.5" /> Quick add
            </button>
            <Link
              href={`/product/${product.slug}`}
              className="product-view-details hidden min-h-11 items-center justify-center gap-2 bg-ivory-50/95 px-3 py-2 text-[0.61rem] font-semibold uppercase tracking-[0.1em] text-forest-950 backdrop-blur-sm hover:bg-gold-200 sm:flex"
              aria-label={`View details for ${product.name}`}
            >
              Details <IconArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        <p
          role="status"
          aria-live="polite"
          className={
            notice
              ? "absolute inset-x-2 top-14 bg-forest-950/95 px-3 py-2 text-center text-xs text-white backdrop-blur-sm"
              : "sr-only"
          }
        >
          {notice}
        </p>
      </div>

      {quickOpen && (
        <QuickAdd product={product} onClose={() => setQuickOpen(false)} />
      )}

      <div className="product-card-details mt-4 flex flex-1 flex-col">
        <p className="text-[0.61rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          {product.subCategory}
        </p>
        <h3 className="mt-1.5 font-display text-xl font-normal leading-tight tracking-[-0.015em]">
          <Link
            href={`/product/${product.slug}`}
            aria-label={product.name}
            className="text-forest-950 transition-colors hover:text-forest-700"
          >
            {styleName}
          </Link>
        </h3>
        <div className="mt-2.5">
          <Price value={product.price} size="sm" />
        </div>
      </div>
    </article>
  );
}
