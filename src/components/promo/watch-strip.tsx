"use client";

/**
 * The wishlist's price line (P0 #5) — what this device last saw, and whether
 * the shop should call when it moves.
 *
 * The comparison is device-local on purpose: "the price you looked at fell" is
 * only meaningful against what that shopper was shown, and there is no account
 * required to remember it. Leaving a number is what turns it into a call from
 * the shop — the alert path that actually exists here.
 */

import Link from "next/link";
import type { Product } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { dropLabel } from "@/lib/price-drop";
import { usePriceAlert } from "@/lib/use-price-watch";
import { usePublicSettings } from "@/lib/use-public-settings";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconBell, IconCheck, IconTrendDown } from "@/components/ui/icons";

function WatchRow({ product }: { product: Product }) {
  const { t } = useLanguage();
  const { watching, toggle, drop } = usePriceAlert(product);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
      <Link
        href={`/product/${product.slug}`}
        className="min-w-0 flex-1 truncate text-sm font-medium text-forest-900 hover:underline"
      >
        {product.name}
      </Link>
      <span className="text-xs text-ink-soft">{formatBdt(product.price)}</span>
      {drop ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-forest-100 px-2.5 py-1 text-[0.68rem] font-semibold text-forest-900">
          <IconTrendDown className="h-3 w-3" />
          {dropLabel(drop)}
        </span>
      ) : null}
      <button
        type="button"
        onClick={() => toggle()}
        aria-pressed={watching}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 transition-colors ${
          watching
            ? "bg-forest-800 text-ivory-50 ring-forest-700"
            : "bg-paper text-forest-800 ring-line hover:ring-forest-400"
        }`}
      >
        {watching ? <IconCheck className="h-3 w-3" /> : <IconBell className="h-3 w-3" />}
        {watching ? t("priceDrop.watching") : t("priceDrop.watch")}
      </button>
    </li>
  );
}

export default function PriceWatchStrip({ products }: { products: Product[] }) {
  const { t } = useLanguage();
  const { settings } = usePublicSettings();
  if (!settings.priceAlertsEnabled || products.length === 0) return null;
  const drops = products.length;
  return (
    <div
      data-testid="price-watch-strip"
      className="rounded-2xl border border-line bg-paper px-4 py-3"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ink-soft">
        {t("priceDrop.watch")} · {drops}
      </p>
      <ul className="mt-1 divide-y divide-line">
        {products.slice(0, 6).map((product) => (
          <WatchRow key={product.id} product={product} />
        ))}
      </ul>
      <p className="mt-1 text-[0.68rem] leading-5 text-ink-soft">{t("priceDrop.channel")}</p>
    </div>
  );
}
