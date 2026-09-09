"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Category,
  CategoryId,
  DeliveryZone,
  Product,
  Shop,
} from "@/lib/catalog";
import {
  MOODS,
  matchesMood,
  isDiscoverable,
  type MoodId,
} from "@/lib/merchandising";
import { matchesProduct } from "@/lib/product-search";
import { filterProductsForZone } from "@/lib/shop-utils";
import { useMyZone } from "@/lib/use-my-zone";
import { bdt } from "@/lib/format";
import ProductCard from "@/components/product/product-card";
import Drawer from "@/components/ui/drawer";
import {
  IconBox,
  IconClose,
  IconSearch,
  IconChevron,
} from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

type CategoryFilter = "all" | CategoryId;
type SortKey = "featured" | "newest" | "price-asc" | "price-desc";

/** Static price band bounds — labels come from translations so BN shows pure Bangla. */
const PRICE_BAND_DEFS: {
  key: string;
  min?: number;
  max?: number;
}[] = [
  { key: "any" },
  { key: "under500", max: 500 },
  { key: "under1000", max: 1000 },
  { key: "1000-1500", min: 1000, max: 1500 },
  { key: "1500-2500", min: 1500, max: 2500 },
  { key: "above2500", min: 2500 },
];

const inBand = (price: number, key: string): boolean => {
  const band = PRICE_BAND_DEFS.find((b) => b.key === key);
  if (!band || band.key === "any") return true;
  if (band.min !== undefined && price < bdt(band.min)) return false;
  if (band.max !== undefined && price >= bdt(band.max)) return false;
  return true;
};

/** Sizes/colours are derived from the catalog, so a filter never offers an
 *  option nothing matches (and never misses a colour a new product adds). */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

const collectSizes = (products: Product[]): string[] => {
  const set = new Set<string>();
  for (const p of products) for (const s of p.sizes) set.add(s);
  return [...set].sort((a, b) => {
    const ia = SIZE_ORDER.indexOf(a);
    const ib = SIZE_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
};

const collectColors = (products: Product[]): string[] => {
  const set = new Set<string>();
  for (const p of products) for (const c of p.colors) set.add(c);
  return [...set].sort((a, b) => a.localeCompare(b));
};

export default function ShopBrowser({
  products,
  categories,
  shops,
  zones,
  initialCategory,
  initialNew,
  initialQuery = "",
  initialMood = "",
  initialPrice = "any",
}: {
  products: Product[];
  categories: Category[];
  shops: Shop[];
  zones: DeliveryZone[];
  initialCategory: CategoryFilter;
  initialNew: boolean;
  initialQuery?: string;
  initialMood?: MoodId | "";
  initialPrice?: "any" | "under500";
}) {
  const { t } = useLanguage();
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);
  const [onlyNew, setOnlyNew] = useState(initialNew);
  const [q, setQ] = useState(initialQuery);
  const [sort, setSort] = useState<SortKey>("featured");
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [mood, setMood] = useState<MoodId | "">(initialMood);
  const [priceBand, setPriceBand] = useState<string>(initialPrice);
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  /** Zone-scoped discovery (marketplace slice 4): the persisted "deliver
   *  to" choice filters browse to serving shops. A stale id (zone removed
   *  since) behaves as "all zones" instead of emptying the shop. */
  const { zoneId, setZoneId } = useMyZone();
  const scopedZoneId =
    zoneId && zones.some((z) => z.id === zoneId) ? zoneId : null;
  const scopedZone = zones.find((z) => z.id === scopedZoneId);
  const fallbackShopId = shops[0]?.id ?? "";
  const zonedProducts = useMemo(
    () => filterProductsForZone(products, shops, scopedZoneId, fallbackShopId),
    [products, shops, scopedZoneId, fallbackShopId],
  );

  const SORTS: { key: SortKey; label: string }[] = [
    { key: "featured", label: t("shopBrowser.featured") },
    { key: "newest", label: t("shopBrowser.newest") },
    { key: "price-asc", label: t("shopBrowser.priceLowHigh") },
    { key: "price-desc", label: t("shopBrowser.priceHighLow") },
  ];

  const PRICE_BANDS: { key: string; label: string; min?: number; max?: number }[] =
    PRICE_BAND_DEFS.map((b) => {
      const labelMap: Record<string, string> = {
        any: t("shopBrowser.anyPrice"),
        under500: t("shopBrowser.under500"),
        under1000: t("shopBrowser.under1000"),
        "1000-1500": t("shopBrowser.price1000to1500"),
        "1500-2500": t("shopBrowser.price1500to2500"),
        above2500: t("shopBrowser.above2500"),
      };
      return { ...b, label: labelMap[b.key] ?? b.key };
    });

  /**
   * Keep the filters in step with the URL. Without this, going from
   * `/shop?category=men` to `/shop?filter=new` (header/footer links) left the
   * old filters on screen — the page looked frozen.
   */
  const lastUrlState = useRef({
    initialCategory,
    initialNew,
    initialQuery,
    initialMood,
    initialPrice,
  });
  useEffect(() => {
    const prev = lastUrlState.current;
    if (
      prev.initialCategory !== initialCategory ||
      prev.initialNew !== initialNew ||
      prev.initialMood !== initialMood ||
      prev.initialPrice !== initialPrice ||
      prev.initialQuery !== initialQuery
    ) {
      lastUrlState.current = {
        initialCategory,
        initialNew,
        initialQuery,
        initialMood,
        initialPrice,
      };
      setCategory(initialCategory);
      setOnlyNew(initialNew);
      setQ(initialQuery);
      setSizes([]);
      setColors([]);
      setPriceBand(initialPrice);
      setMood(initialMood);
      setOnlyInStock(false);
      setSort("featured");
    }
  }, [initialCategory, initialNew, initialQuery, initialMood, initialPrice]);

  const allSizes = useMemo(
    () => collectSizes(zonedProducts),
    [zonedProducts],
  );
  const allColors = useMemo(
    () => collectColors(zonedProducts),
    [zonedProducts],
  );

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const visible = useMemo(() => {
    let list = zonedProducts
      .filter(isDiscoverable)
      .map((p, index) => ({ p, index }));
    if (mood) list = list.filter(({ p }) => matchesMood(p, mood));
    if (category !== "all")
      list = list.filter(({ p }) => p.category === category);
    if (onlyNew) list = list.filter(({ p }) => p.isNew);
    if (onlyInStock) list = list.filter(({ p }) => p.inStock);
    if (sizes.length)
      list = list.filter(({ p }) => p.sizes.some((s) => sizes.includes(s)));
    if (colors.length)
      list = list.filter(({ p }) => p.colors.some((c) => colors.includes(c)));
    if (priceBand !== "any")
      list = list.filter(({ p }) => inBand(p.price, priceBand));

    list = list.filter(({ p }) => matchesProduct(p, q));

    const sorted = [...list];
    switch (sort) {
      case "newest":
        sorted.sort(
          (a, b) => Number(b.p.isNew) - Number(a.p.isNew) || b.index - a.index,
        );
        break;
      case "price-asc":
        sorted.sort((a, b) => a.p.price - b.p.price || a.index - b.index);
        break;
      case "price-desc":
        sorted.sort((a, b) => b.p.price - a.p.price || a.index - b.index);
        break;
      default:
        sorted.sort(
          (a, b) =>
            Number(b.p.featured) - Number(a.p.featured) || a.index - b.index,
        );
    }
    return sorted.map(({ p }) => p);
  }, [
    zonedProducts,
    category,
    onlyNew,
    onlyInStock,
    sizes,
    colors,
    priceBand,
    mood,
    q,
    sort,
  ]);

  const hasActiveFilters =
    mood !== "" ||
    category !== "all" ||
    onlyNew ||
    onlyInStock ||
    sizes.length > 0 ||
    colors.length > 0 ||
    priceBand !== "any" ||
    q.trim() !== "";

  const resetAll = () => {
    setMood("");
    setCategory("all");
    setOnlyNew(false);
    setSizes([]);
    setColors([]);
    setPriceBand("any");
    setOnlyInStock(false);
    setQ("");
  };

  const categoryCount = (id: CategoryId) =>
    zonedProducts.filter((p) => p.category === id).length;

  /** Rendered twice (sidebar + drawer); `scope` keeps radio groups apart so
   *  the two copies do not fight over the same browser radio group. */
  const renderFilters = (scope: string) => (
    <div className="space-y-8">
      <Fieldset title={t("shopBrowser.styleEdit")}>
        <div className="flex flex-wrap gap-2">
          {MOODS.map((edit) => (
            <button
              type="button"
              key={edit.id}
              aria-pressed={mood === edit.id}
              onClick={() => setMood(mood === edit.id ? "" : edit.id)}
              className={`min-h-11 border px-3 text-xs ${mood === edit.id ? "border-forest-800 bg-forest-800 text-white" : "border-line text-ink-soft"}`}
            >
              {edit.name}
            </button>
          ))}
        </div>
      </Fieldset>
      {/* Categories */}
      <Fieldset title={t("shopBrowser.categories")}>
        <div className="space-y-1">
          {(["all", ...categories.map((c) => c.id)] as CategoryFilter[]).map(
            (id) => {
              const label =
                id === "all"
                  ? t("shopBrowser.allProducts")
                  : (categories.find((c) => c.id === id)?.name ?? id);
              const count =
                id === "all"
                  ? zonedProducts.length
                  : categoryCount(id as CategoryId);
              return (
                <label
                  key={id}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors hover:bg-ivory-100"
                >
                  <span className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name={`${scope}-category`}
                      checked={category === id}
                      onChange={() => setCategory(id)}
                      className="h-4 w-4 accent-forest-700"
                    />
                    <span
                      className={
                        category === id
                          ? "font-medium text-ink"
                          : "text-ink-soft"
                      }
                    >
                      {label}
                    </span>
                  </span>
                  <span className="text-xs text-ink-soft/70">{count}</span>
                </label>
              );
            },
          )}
        </div>
      </Fieldset>

      {/* Price */}
      <Fieldset title={t("shopBrowser.price")}>
        <div className="space-y-1">
          {PRICE_BANDS.map((band) => (
            <label
              key={band.key}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink-soft transition-colors hover:bg-ivory-100"
            >
              <input
                type="radio"
                name={`${scope}-price`}
                checked={priceBand === band.key}
                onChange={() => setPriceBand(band.key)}
                className="h-4 w-4 accent-forest-700"
              />
              {band.label}
            </label>
          ))}
        </div>
      </Fieldset>

      {/* Size */}
      {allSizes.length > 0 && (
        <Fieldset title={t("shopBrowser.size")}>
          <div className="flex flex-wrap gap-2">
            {allSizes.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setSizes((s) => toggle(s, size))}
                aria-pressed={sizes.includes(size)}
                className={`h-11 min-w-11 rounded-full px-2.5 text-sm font-medium transition-colors ${
                  sizes.includes(size)
                    ? "bg-forest-800 text-ivory-50"
                    : "bg-paper text-ink-soft ring-1 ring-line hover:ring-forest-400"
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </Fieldset>
      )}

      {/* Color */}
      {allColors.length > 0 && (
        <Fieldset title={t("shopBrowser.colour")}>
          <div className="flex flex-wrap gap-2">
            {allColors.map((color) => {
              const active = colors.includes(color);
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setColors((c) => toggle(c, color))}
                  aria-pressed={active}
                  className={`min-h-11 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                    active
                      ? "bg-forest-800 text-ivory-50"
                      : "bg-paper text-ink-soft ring-1 ring-line hover:ring-forest-400"
                  }`}
                >
                  {color}
                </button>
              );
            })}
          </div>
        </Fieldset>
      )}

      {/* Availability */}
      <label className="flex cursor-pointer items-center gap-2.5 px-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={onlyInStock}
          onChange={(e) => setOnlyInStock(e.target.checked)}
          className="h-4 w-4 accent-forest-700"
        />
        {t("shopBrowser.inStockOnly")}
      </label>
    </div>
  );

  const activeFilters = [
    ...(mood
      ? [
          {
            key: "mood",
            label: `${t("shopBrowser.style")}: ${MOODS.find((m) => m.id === mood)?.name}`,
            remove: () => setMood(""),
          },
        ]
      : []),
    ...(category !== "all"
      ? [
          {
            key: "category",
            label: categories.find((c) => c.id === category)?.name ?? category,
            remove: () => setCategory("all"),
          },
        ]
      : []),
    ...(onlyNew
      ? [{ key: "new", label: t("shopBrowser.newArrivals"), remove: () => setOnlyNew(false) }]
      : []),
    ...(priceBand !== "any"
      ? [
          {
            key: "price",
            label: PRICE_BANDS.find((band) => band.key === priceBand)!.label,
            remove: () => setPriceBand("any"),
          },
        ]
      : []),
    ...sizes.map((size) => ({
      key: `size-${size}`,
      label: `${t("shopBrowser.size")}: ${size}`,
      remove: () =>
        setSizes((current) => current.filter((value) => value !== size)),
    })),
    ...colors.map((color) => ({
      key: `color-${color}`,
      label: `${t("shopBrowser.colour")}: ${color}`,
      remove: () =>
        setColors((current) => current.filter((value) => value !== color)),
    })),
    ...(onlyInStock
      ? [
          {
            key: "stock",
            label: t("shopBrowser.inStockOnly"),
            remove: () => setOnlyInStock(false),
          },
        ]
      : []),
    ...(q.trim()
      ? [{ key: "query", label: `${t("shopBrowser.search")}: ${q.trim()}`, remove: () => setQ("") }]
      : []),
  ];
  const activeFilterCount = activeFilters.length;

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col gap-4 border-b border-line pb-6 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("shopBrowser.searchPlaceholder")}
            aria-label={t("shopBrowser.searchAria")}
            className="h-12 w-full rounded-sm bg-paper pl-11 pr-4 text-base sm:text-sm text-ink shadow-sm ring-1 ring-line transition-shadow placeholder:text-ink-soft/60 focus:ring-2 focus:ring-forest-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="flex min-w-0 items-center gap-2 text-sm text-ink-soft">
            <span className="hidden whitespace-nowrap sm:inline">
              {t("shopBrowser.deliverTo")}
            </span>
            <span className="relative min-w-0 flex-1 sm:flex-none">
              <select
                value={scopedZoneId ?? ""}
                onChange={(e) => setZoneId(e.target.value || null)}
                aria-label={t("shopBrowser.deliverTo")}
                className="h-12 w-full min-w-0 appearance-none rounded-sm bg-paper pl-4 pr-9 text-sm font-medium text-ink ring-1 ring-line focus:ring-2 focus:ring-forest-500 sm:w-auto sm:pl-5 sm:pr-10"
              >
                <option value="">{t("shopBrowser.allZones")}</option>
                {zones
                  .filter((z) => z.active !== false)
                  .map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
              </select>
              <IconChevron className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
            </span>
          </label>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            className="inline-flex h-12 shrink-0 items-center gap-2 rounded-sm bg-paper px-4 sm:px-5 text-sm font-medium ring-1 ring-line lg:hidden"
          >
            {t("shopBrowser.filters")}
            {activeFilterCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-700 px-1.5 text-[0.65rem] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-ink-soft sm:flex-none">
            <span className="hidden sm:inline">{t("shopBrowser.sort")}</span>
            <span className="relative min-w-0 flex-1 sm:flex-none">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort products"
                className="h-12 w-full min-w-0 appearance-none rounded-sm bg-paper pl-4 pr-9 text-sm sm:pl-5 sm:pr-10 font-medium text-ink ring-1 ring-line focus:ring-2 focus:ring-forest-500"
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
      </div>

      <p
        className="mt-5 break-words text-sm text-ink-soft"
        role="status"
        aria-live="polite"
      >
        {visible.length} {visible.length === 1 ? t("shopBrowser.product") : t("shopBrowser.products")}
        {category !== "all" &&
          ` ${t("shopBrowser.in")} ${categories.find((c) => c.id === category)?.name ?? ""}`}
        {onlyNew && ` · ${t("shopBrowser.newArrivals")}`}
        {q.trim() && ` ${t("shopBrowser.matching")} “${q.trim()}”`}
        {scopedZone && ` · ${t("shopBrowser.deliverTo")} ${scopedZone.name}`}
      </p>

      {hasActiveFilters && (
        <div
          aria-label="Active filters"
          role="group"
          className="mt-4 flex flex-wrap items-center gap-2"
        >
          {activeFilters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={filter.remove}
              aria-label={`Remove ${filter.label} filter`}
              className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-full bg-forest-100 px-4 py-2 text-xs font-medium text-forest-900 transition-colors hover:bg-forest-200"
            >
              <span className="truncate">{filter.label}</span>
              <IconClose className="h-3.5 w-3.5 shrink-0" />
            </button>
          ))}
          <button
            type="button"
            onClick={resetAll}
            className="min-h-11 px-3 text-xs font-semibold text-forest-700 underline underline-offset-4 hover:text-forest-900"
          >
            {t("shopBrowser.clearAll")}
          </button>
        </div>
      )}

      {/* Desktop layout */}
      <div className="mt-6 grid gap-10 lg:grid-cols-[210px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-40">{renderFilters("sidebar")}</div>
        </aside>

        <div className="min-w-0">
          {visible.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 sm:gap-x-6 xl:grid-cols-3">
              {visible.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center rounded-3xl bg-ivory-100 px-6 py-20 text-center ring-1 ring-line">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-paper text-ink-soft ring-1 ring-line">
                <IconBox className="h-6 w-6" />
              </span>
              <h2 className="font-display mt-5 text-2xl font-medium text-ink">
                {scopedZone && products.length > 0 && zonedProducts.length === 0
                  ? t("shopBrowser.noShopsZone")
                  : t("shopBrowser.noProductsFound")}
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
                {scopedZone && products.length > 0 && zonedProducts.length === 0
                  ? t("shopBrowser.noShopsZoneHint")
                  : t("shopBrowser.tryAnother")}
              </p>
              {scopedZone && products.length > 0 && zonedProducts.length === 0 ? (
                <button
                  type="button"
                  onClick={() => setZoneId(null)}
                  className="mt-6 rounded-full bg-forest-800 px-6 py-3 text-sm font-medium text-ivory-50 transition-colors hover:bg-forest-700"
                >
                  {t("shopBrowser.showAllZones")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={resetAll}
                  className="mt-6 rounded-full bg-forest-800 px-6 py-3 text-sm font-medium text-ivory-50 transition-colors hover:bg-forest-700"
                >
                  {t("shopBrowser.clearFilters")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter drawer — portalled, Escape-closable, scroll-locked */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        label="Product filters"
        side="bottom"
        className="lg:hidden"
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold text-ink">
            {t("shopBrowser.filters")}
          </h2>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close filters"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-forest-100"
          >
            <IconClose />
          </button>
        </div>
        {renderFilters("drawer")}
        <div className="sticky -bottom-6 -mx-6 mt-8 flex gap-3 border-t border-line bg-ivory-50 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={() => {
              resetAll();
              setDrawerOpen(false);
            }}
            className="h-12 flex-1 rounded-full bg-paper text-sm font-medium ring-1 ring-line"
          >
            {t("shopBrowser.reset")}
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="h-12 flex-1 rounded-full bg-forest-800 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            {t("shopBrowser.show")} {visible.length}{" "}
            {visible.length === 1 ? t("shopBrowser.product") : t("shopBrowser.products")}
          </button>
        </div>
      </Drawer>
    </div>
  );
}

function Fieldset({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="mb-3 text-[0.7rem] font-semibold uppercase tracking-[0.28em] text-ink-soft">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}
