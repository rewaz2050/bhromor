"use client";

import Image from "next/image";
import Link from "next/link";
import { coverImage, type Product, type Shop } from "@/lib/catalog";
import { bnDigits } from "@/lib/arrival";
import { isShopOrderable } from "@/lib/shop-utils";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconCheck } from "@/components/ui/icons";
import FreeDeliveryPill from "./free-delivery-pill";

/**
 * Public shop card (marketplace slice 4; UX plan §9, R8): logo, open state,
 * prep time, rating, a **peek at the shelf** (the shop's three best pieces
 * as thumbnails — a card with product on it gets opened, a card with only
 * a name does not), and the zone answer both ways: a green tick when the
 * shop delivers to the picked area, an honest badge when it does not.
 */
export default function ShopCard({
  shop,
  productCount,
  zoneName,
  servesZone,
  topProducts = [],
}: {
  shop: Shop;
  productCount: number;
  zoneName: string | null;
  servesZone: boolean;
  topProducts?: Product[];
}) {
  const { t, lang } = useLanguage();
  const open = isShopOrderable(shop);
  const digits = (n: number | string) => (lang === "bn" ? bnDigits(String(n)) : String(n));
  const href = `/shops/${shop.slug}`;
  const peek = topProducts.slice(0, 3);
  return (
    <article
      data-testid="shop-card"
      className="group relative flex min-w-0 flex-col overflow-hidden rounded-3xl bg-paper p-6 ring-1 ring-line transition-shadow hover:shadow-lg"
      data-cover={shop.coverUrl ? "1" : undefined}
    >
      {/* Cover banner (UX plan §9, R9) — only when the shop set one. */}
      {shop.coverUrl && (
        <Link href={href} tabIndex={-1} aria-hidden="true" className="-mx-6 -mt-6 mb-5 block aspect-[3/1] overflow-hidden bg-ivory-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={shop.coverUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            data-testid="shop-card-cover"
          />
        </Link>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {shop.logoUrl && (
            <span className="relative block h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-ivory-100 ring-1 ring-line">
              <Image
                src={shop.logoUrl}
                alt={t("shops.shopLogoAlt").replace("{shop}", shop.name)}
                fill
                sizes="48px"
                className="object-cover"
              />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="font-display truncate text-2xl text-forest-900">
              <Link href={href} className="transition-colors group-hover:text-forest-700">
                {shop.name}
              </Link>
            </h2>
            {shop.tagline && (
              <p className="mt-1 line-clamp-2 text-sm text-ink-soft">
                {shop.tagline}
              </p>
            )}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
            open ? "bg-forest-100 text-forest-800" : "bg-ivory-200 text-ink-soft"
          }`}
        >
          {open ? t("shops.openNow") : t("shops.closed")}
        </span>
      </div>

      {/* UX plan §9 — a peek at the shelf: three thumbnails, one tap in. */}
      {peek.length > 0 && (
        <Link
          href={href}
          aria-label={`${t("shops.topPieces")} — ${shop.name}`}
          data-testid="shop-peek"
          className="mt-5 grid grid-cols-3 gap-2"
        >
          {peek.map((p) => {
            const cover = coverImage(p);
            return (
              <span
                key={p.id}
                className="relative block aspect-[4/5] overflow-hidden rounded-xl bg-ivory-100 ring-1 ring-line"
              >
                {cover.src ? (
                  <Image
                    src={cover.src}
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="(min-width: 1024px) 120px, (min-width: 640px) 25vw, 30vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                ) : null}
              </span>
            );
          })}
        </Link>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-soft">
        <span>
          {digits(productCount)}{lang === "bn" ? "" : " "}
          {productCount === 1 ? t("shops.product") : t("shops.products")}
        </span>
        <span>{t("shops.prepIn").replace("{min}", digits(shop.prepMinutes))}</span>
        {shop.ratingCount > 0 && (
          <span>
            ★ {digits(shop.ratingAvg.toFixed(1))} ({digits(shop.ratingCount)})
          </span>
        )}
        {/* Free-delivery threshold (2026-09-26) — only when a rule is armed. */}
        <FreeDeliveryPill shop={shop} />
      </div>

      {zoneName && servesZone && (
        <p
          data-testid="shop-serves-zone"
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-forest-800"
        >
          <IconCheck className="h-3.5 w-3.5" />
          {t("shops.deliversHere")} ({zoneName})
        </p>
      )}
      {zoneName && !servesZone && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
          {t("shops.notInYourZone")} ({zoneName})
        </p>
      )}

      <Link
        href={href}
        className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-forest-800 px-6 text-sm font-medium text-ivory-50 transition-colors hover:bg-forest-700"
      >
        {t("shops.visitShop")}
      </Link>
    </article>
  );
}
