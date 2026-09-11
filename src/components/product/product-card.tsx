"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { coverImage, secondImage, type Product } from "@/lib/catalog";
import { useTransientValue } from "@/lib/use-transient-value";
import { useWishlist } from "@/lib/use-wishlist";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { productShopId, shopById } from "@/lib/shop-utils";
import { Price } from "@/components/ui/primitives";
import { IconArrowRight, IconHeart, IconPlus } from "@/components/ui/icons";
import QuickAdd from "./quick-add";
import { useLanguage } from "@/components/i18n/language-provider";

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
  const { t } = useLanguage();
  const { has, toggle, ready, busy } = useWishlist();
  const [quickOpen, setQuickOpen] = useState(false);
  const [notice, setNotice] = useTransientValue("");
  const wished = has(product.id);
  const cover = coverImage(product);
  const hoverImage = secondImage(product);
  const styleName = editorialProductName(product);
  const { shops } = useLiveCatalog();
  const shop = shopById(shops, productShopId(product, shops[0]?.id ?? ""));

  return (
    <article className="product-card group relative flex min-w-0 flex-col">
      <div className="product-card-media relative overflow-hidden bg-ivory-100">
        <Link
          href={`/product/${product.slug}`}
          className="relative block aspect-[4/5]"
          aria-label={`View ${product.name}`}
        >
          <Image
            src={cover.src}
            alt={cover.alt || product.name}
            fill
            sizes="(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 72vw"
            className="product-image-primary object-cover"
          />
          {hoverImage && (
            <Image
              src={hoverImage.src}
              alt=""
              aria-hidden="true"
              fill
              sizes="(min-width: 1280px) 300px, (min-width: 1024px) 25vw, (min-width: 640px) 50vw, 72vw"
              className="product-image-secondary absolute inset-0 h-full w-full object-cover opacity-0"
            />
          )}
          {!product.inStock && (
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-forest-950/85 py-2.5 text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-ivory-100 backdrop-blur-[2px]">
              {t("product.soldOut")}
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
                  ? t("product.removedFromWishlist")
                  : t("product.addedToWishlist")
                : t("product.wishlistError"),
            );
          }}
          disabled={!ready || busy}
          aria-label={wished ? t("product.removeFromWishlist") : t("product.addToWishlist")}
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
              <IconPlus className="h-3.5 w-3.5" /> {t("product.quickAdd")}
            </button>
            <Link
              href={`/product/${product.slug}`}
              className="product-view-details hidden min-h-11 items-center justify-center gap-2 bg-ivory-50/95 px-3 py-2 text-[0.61rem] font-semibold uppercase tracking-[0.1em] text-forest-950 backdrop-blur-sm hover:bg-gold-200 sm:flex"
              aria-label={`${t("product.viewDetails")} ${product.name}`}
            >
              {t("product.details")} <IconArrowRight className="h-3.5 w-3.5" />
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
        <p className="flex items-center gap-2 text-[0.61rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          <span>{product.subCategory}</span>
          {product.colors[0] && (
            <>
              <span aria-hidden="true" className="text-line">
                /
              </span>
              <span className="font-medium normal-case tracking-[0.06em] text-ink-soft/80">
                {product.colors[0]}
              </span>
            </>
          )}
        </p>
        <h3 className="product-card-title mt-1.5 font-display text-xl font-normal leading-tight tracking-[-0.015em]">
          <Link
            href={`/product/${product.slug}`}
            aria-label={product.name}
            className="text-forest-950 hover:text-forest-700"
          >
            {styleName}
          </Link>
        </h3>
        <div className="mt-auto pt-2.5">
          <Price
            value={product.price}
            compareAt={product.compareAtPrice}
            size="sm"
          />
          {shop && (
            <p className="mt-1 truncate text-xs text-ink-soft">
              {t("shops.soldBy")}{" "}
              <Link
                href={`/shops/${shop.slug}`}
                className="font-medium text-forest-700 underline-offset-2 hover:underline"
              >
                {shop.name}
              </Link>
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
