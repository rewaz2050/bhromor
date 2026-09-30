"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Category, DeliveryZone, Product, Shop } from "@/lib/catalog";
import { shopServesZone } from "@/lib/shop-utils";
import { IconTruck } from "@/components/ui/icons";
import { useMyZone } from "@/lib/use-my-zone";
import { useLanguage } from "@/components/i18n/language-provider";
import { categoryLabel } from "@/lib/home-shelves";
import { bnDigits } from "@/lib/arrival";
import {
  EMPTY_SHOP_FILTERS,
  SHOP_SORTS,
  directoryCategories,
  filterShopsForDirectory,
  shopStockedCategories,
  type ShopSort,
} from "@/lib/shop-directory";
import ShopCard from "./shop-card";

const SORT_LABEL: Record<ShopSort, string> = {
  recommended: "Recommended",
  rating: "Top rated",
  shelf: "Biggest shelf",
  name: "A–Z",
};
const SORT_LABEL_BN: Record<ShopSort, string> = {
  recommended: "আমাদের বাছাই",
  rating: "সেরা রেটিং",
  shelf: "সবচেয়ে বড় শেলফ",
  name: "নাম অনুযায়ী",
};

/**
 * Shops directory (marketplace slice 4) — search, sort and filters added
 * 2026-09-28 (item A1 of docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md).
 *
 * Client component: it reads the visitor's language and picked delivery
 * zone (both client state), so the /shops page passes it plain serializable
 * data as props. The filtering/sorting itself lives in the pure module
 * `@/lib/shop-directory` so every rule is unit-tested.
 *
 * Honesty, kept from the rest of the storefront:
 *   • with a zone picked, serving shops float to the top; the "my area"
 *     toggle is opt-in and always reports how many shops it hid;
 *   • an empty tab is not a dead end — one tap clears the filters.
 */
export default function ShopsDirectory({
  shops,
  zones,
  categories = [],
  productCounts,
  peeks = {},
  catalog = [],
}: {
  shops: Shop[];
  zones: DeliveryZone[];
  /** Catalog categories (used for the chip labels). */
  categories?: Category[];
  productCounts: Record<string, number>;
  /** UX plan §9 (R8) — each shop's best three pieces, for the card thumbnails. */
  peeks?: Record<string, Product[]>;
  /** Every catalog row, so the category chips know which shop stocks what. */
  catalog?: Product[];
}) {
  const { t, lang } = useLanguage();
  const { zoneId } = useMyZone();
  const zone = zones.find((z) => z.id === zoneId) ?? null;

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<ShopSort>("recommended");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [zoneFilterOn, setZoneFilterOn] = useState(false);

  // The area filter only bites while a zone is actually picked: the visitor's
  // zone is remembered per device, so an un-picked zone must never hide
  // shops, and clearing the zone silently un-arms the toggle.
  const onlyServingZone = zoneFilterOn && zone !== null;

  const fallbackShopId = shops[0]?.id ?? "";
  const categoriesByShop = useMemo(
    () => shopStockedCategories(catalog, fallbackShopId),
    [catalog, fallbackShopId],
  );
  const chips = useMemo(
    () => directoryCategories(categories, categoriesByShop),
    [categories, categoriesByShop],
  );
  const activeCategory = chips.some((c) => c.id === categoryId) ? categoryId : null;

  const { shops: visible, hiddenByZone } = useMemo(
    () =>
      filterShopsForDirectory(shops, productCounts, categoriesByShop, {
        ...EMPTY_SHOP_FILTERS,
        q,
        sort,
        categoryId: activeCategory,
        zoneId: zone?.id ?? null,
        onlyServingZone,
      }),
    [shops, productCounts, categoriesByShop, q, sort, activeCategory, zone?.id, onlyServingZone],
  );

  const filtered = Boolean(q.trim()) || activeCategory !== null || onlyServingZone;
  const digits = (n: number | string) => (lang === "bn" ? bnDigits(String(n)) : String(n));
  const clear = () => {
    setQ("");
    setCategoryId(null);
    setSort("recommended");
    setZoneFilterOn(false);
  };
  const sortLabel = (key: ShopSort) => (lang === "bn" ? SORT_LABEL_BN[key] : SORT_LABEL[key]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.72rem] font-medium uppercase tracking-[0.24em] text-gold-700">
            Marketplace
          </p>
          <h1
            lang={lang === "bn" ? "bn" : undefined}
            className={`font-display mt-2 text-3xl font-medium tracking-tight text-forest-900 sm:text-4xl ${lang === "bn" ? "font-bengali" : ""}`}
          >
            {t("shops.title")}
          </h1>
          <p className="mt-3 max-w-2xl leading-7 text-ink-soft">{t("shops.subtitle")}</p>
        </div>

        <Link
          href="/shops/apply"
          className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-5 py-2.5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-900"
        >
          <IconTruck className="h-4 w-4 text-gold-300" />
          দোকান লিস্টিং করুন →
        </Link>
      </div>

      <div className="mt-8 space-y-4">
        <label className="block">
          <span className="sr-only">{t("shops.searchLabel")}</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("shops.searchPlaceholder")}
            className="w-full rounded-full border border-line bg-paper px-5 py-3 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-forest-700"
          />
        </label>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("shops.sortLabel")}>
            {SHOP_SORTS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSort(key)}
                aria-pressed={sort === key}
                className={`min-h-9 rounded-full px-4 text-xs font-semibold transition-colors ${
                  sort === key
                    ? "bg-forest-800 text-ivory-50"
                    : "bg-paper text-ink-soft ring-1 ring-line hover:text-forest-800"
                }`}
              >
                {sortLabel(key)}
              </button>
            ))}
          </div>

          <label
            className={`inline-flex min-h-9 items-center gap-2 rounded-full px-4 text-xs font-semibold ${
              zone
                ? "cursor-pointer bg-paper text-ink ring-1 ring-line"
                : "cursor-not-allowed bg-ivory-200 text-ink-soft"
            }`}
          >
            <input
              type="checkbox"
              checked={onlyServingZone}
              disabled={!zone}
              onChange={(e) => setZoneFilterOn(e.target.checked)}
              className="h-4 w-4 accent-forest-800"
            />
            {zone ? t("shops.servesToggle").replace("{zone}", zone.name) : t("shops.servesToggleNoZone")}
          </label>
        </div>

        {chips.length >= 2 && (
          <div className="flex flex-wrap items-center gap-2" aria-label={t("shopBrowser.categories")}>
            <button
              type="button"
              onClick={() => setCategoryId(null)}
              aria-pressed={activeCategory === null}
              className={`min-h-11 rounded-full px-4 text-xs font-semibold transition-colors ${
                activeCategory === null
                  ? "bg-forest-800 text-ivory-50"
                  : "bg-paper text-ink-soft ring-1 ring-line hover:text-forest-800"
              }`}
            >
              {t("shopBrowser.allProducts")}
            </button>
            {chips.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                aria-pressed={activeCategory === c.id}
                className={`min-h-11 rounded-full px-4 text-xs font-semibold transition-colors ${
                  activeCategory === c.id
                    ? "bg-forest-800 text-ivory-50"
                    : "bg-paper text-ink-soft ring-1 ring-line hover:text-forest-800"
                }`}
              >
                {categoryLabel(c, lang)}
              </button>
            ))}
          </div>
        )}

        <p className="text-sm text-ink-soft" data-testid="shops-count">
          {filtered
            ? t("shops.countFiltered")
                .replace("{n}", digits(visible.length))
                .replace("{total}", digits(shops.length))
            : t("shops.countTotal").replace("{n}", digits(visible.length))}
          {hiddenByZone > 0
            ? ` · ${t("shops.hiddenByZone").replace("{n}", digits(hiddenByZone))}`
            : ""}
        </p>
      </div>

      {visible.length === 0 ? (
        <div
          data-testid="shops-empty"
          className="mt-8 rounded-3xl bg-ivory-100 px-6 py-16 text-center ring-1 ring-line"
        >
          <h2 className="font-display text-2xl font-medium text-ink">{t("shops.emptyTitle")}</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-soft">
            {t("shops.emptyBody")}
          </p>
          <button
            type="button"
            onClick={clear}
            className="mt-6 inline-flex min-h-11 items-center rounded-full bg-forest-800 px-6 text-sm font-medium text-ivory-50 transition-colors hover:bg-forest-700"
          >
            {t("shops.emptyClear")}
          </button>
        </div>
      ) : (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((shop) => (
            <ShopCard
              key={shop.id}
              shop={shop}
              productCount={productCounts[shop.id] ?? 0}
              zoneName={zone?.name ?? null}
              servesZone={zone ? shopServesZone(shop, zone.id) : true}
              topProducts={peeks[shop.id] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
