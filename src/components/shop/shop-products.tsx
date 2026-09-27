"use client";

import { useMemo, useState } from "react";
import ProductCard, { GRID_CARD_SIZES } from "@/components/product/product-card";
import type { Category, DeliveryZone, Product, Shop } from "@/lib/catalog";
import { shopServesZone } from "@/lib/shop-utils";
import { useMyZone } from "@/lib/use-my-zone";
import { useLanguage } from "@/components/i18n/language-provider";
import { categoryLabel } from "@/lib/home-shelves";
import { sortShelf, type SortKey } from "@/lib/shop-sort";
import { IconChevron } from "@/components/ui/icons";

/**
 * One shop's shelf (marketplace slice 4). Products always list — hiding
 * them behind a zone the shopper hasn't confirmed would be presumptuous —
 * but a zone mismatch gets an upfront banner, not a checkout surprise.
 *
 * UX plan §9 (R11): the shelf gets its own category chips (only the
 * categories this shop actually stocks, with counts — shown from two) and
 * the same sort as /shop, so a shop with forty pieces is browsable without
 * leaving its page.
 */
export default function ShopProducts({
  products,
  shop,
  zones,
  categories = [],
}: {
  products: Product[];
  shop: Shop;
  zones: DeliveryZone[];
  categories?: Category[];
}) {
  const { t, lang } = useLanguage();
  const { zoneId } = useMyZone();
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const mismatch = zone !== null && !shopServesZone(shop, zone.id);
  const [category, setCategory] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("featured");

  const chips = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    const known = categories.filter((c) => counts.has(c.id));
    const unknown = [...counts.keys()].filter((id) => !categories.some((c) => c.id === id));
    const list = [
      ...known.map((c) => ({ id: c.id, label: categoryLabel(c, lang), count: counts.get(c.id) ?? 0 })),
      ...unknown.map((id) => ({ id, label: id, count: counts.get(id) ?? 0 })),
    ];
    return list.length >= 2 ? list : [];
  }, [products, categories, lang]);

  const activeCategory = chips.some((c) => c.id === category) ? category : "all";
  const visible = useMemo(
    () => sortShelf(activeCategory === "all" ? products : products.filter((p) => p.category === activeCategory), sort),
    [products, activeCategory, sort],
  );

  const SORTS: { key: SortKey; label: string }[] = [
    { key: "featured", label: t("shopBrowser.featured") },
    { key: "newest", label: t("shopBrowser.newest") },
    { key: "best", label: t("shopBrowser.bestSellers") },
    { key: "price-asc", label: t("shopBrowser.priceLowHigh") },
    { key: "price-desc", label: t("shopBrowser.priceHighLow") },
  ];

  if (products.length === 0) {
    return (
      <div className="rounded-3xl bg-ivory-100 px-6 py-16 text-center ring-1 ring-line">
        <h2 className="font-display text-2xl font-medium text-ink">
          {t("shopBrowser.noProductsFound")}
        </h2>
        <p className="mt-2 text-sm text-ink-soft">
          {t("shopBrowser.tryAnother")}
        </p>
      </div>
    );
  }

  return (
    <div>
      {mismatch && zone && (
        <p className="mb-6 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 ring-1 ring-amber-200">
          {t("shops.notInYourZone")} ({zone.name}) —{" "}
          {t("shopBrowser.noShopsZoneHint")}
        </p>
      )}

      {/* Toolbar — count + sort; category chips under it when the shop spans more than one. */}
      <div className="flex items-center justify-between gap-3" data-testid="shop-shelf-toolbar">
        <p className="min-w-0 truncate text-sm text-ink-soft" role="status" aria-live="polite">
          {visible.length} {visible.length === 1 ? t("shopBrowser.product") : t("shopBrowser.products")}
        </p>
        <label className="flex min-w-0 items-center gap-2 text-sm text-ink-soft">
          <span className="hidden sm:inline">{t("shopBrowser.sort")}</span>
          <span className="relative min-w-0">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label={t("shopBrowser.sortAria")}
              data-testid="shop-shelf-sort"
              className="h-11 w-full min-w-0 max-w-[11rem] appearance-none rounded-full bg-paper pl-4 pr-9 text-sm font-medium text-ink ring-1 ring-line focus:ring-2 focus:ring-forest-500 sm:max-w-none sm:pl-5 sm:pr-10"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <IconChevron className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          </span>
        </label>
      </div>
      {chips.length > 0 && (
        <div
          role="group"
          aria-label={t("shopBrowser.categories")}
          data-testid="shop-shelf-chips"
          className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {[{ id: "all", label: t("shopBrowser.allProducts"), count: products.length }, ...chips].map((chip) => {
            const active = activeCategory === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                onClick={() => setCategory(chip.id)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-xs font-medium transition-colors ${
                  active
                    ? "bg-forest-800 text-ivory-50"
                    : "bg-ivory-100 text-ink-soft ring-1 ring-line hover:text-forest-900"
                }`}
              >
                {chip.label}
                <span className={`text-[0.65rem] ${active ? "text-ivory-50/80" : "text-ink-soft/80"}`}>{chip.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="mt-6 grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 xl:grid-cols-3" data-list="shop-shelf">
        {visible.map((product) => (
          <ProductCard key={product.id} product={product} sizes={GRID_CARD_SIZES} />
        ))}
      </div>
    </div>
  );
}
