"use client";

import { useMemo, useState } from "react";
import type { Category, CategoryId, Product } from "@/lib/catalog";
import { bdt } from "@/lib/format";
import ProductCard from "@/components/product/product-card";
import {
  IconBox,
  IconClose,
  IconSearch,
  IconChevron,
} from "@/components/ui/icons";

type CategoryFilter = "all" | CategoryId;
type SortKey = "featured" | "newest" | "price-asc" | "price-desc";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "featured", label: "Featured" },
  { key: "newest", label: "Newest" },
  { key: "price-asc", label: "Price: Low → High" },
  { key: "price-desc", label: "Price: High → Low" },
];

const PRICE_BANDS = [
  { key: "any", label: "Any price" },
  { key: "under1000", label: "Under ৳1,000", max: 1000 },
  { key: "1000-1500", label: "৳1,000 – ৳1,500", max: 1500 },
  { key: "1500-2500", label: "৳1,500 – ৳2,500", max: 2500 },
  { key: "above2500", label: "Above ৳2,500" },
];

const ALL_SIZES = ["S", "M", "L", "XL", "XXL"];
const ALL_COLORS = [
  "Forest Green",
  "Ivory",
  "Slate",
  "Emerald",
  "Cream",
  "Deep Teal Check",
  "Red & Cream",
];

export default function ShopBrowser({
  products,
  categories,
  initialCategory,
  initialNew,
}: {
  products: Product[];
  categories: Category[];
  initialCategory: CategoryFilter;
  initialNew: boolean;
}) {
  const [category, setCategory] = useState<CategoryFilter>(initialCategory);
  const [onlyNew, setOnlyNew] = useState(initialNew);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("featured");
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [priceBand, setPriceBand] = useState<string>("any");
  const [onlyInStock, setOnlyInStock] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toggle = (list: string[], value: string) =>
    list.includes(value)
      ? list.filter((v) => v !== value)
      : [...list, value];

  const visible = useMemo(() => {
    let list = [...products];
    if (category !== "all") list = list.filter((p) => p.category === category);
    if (onlyNew) list = list.filter((p) => p.isNew);
    if (onlyInStock) list = list.filter((p) => p.inStock);
    if (sizes.length)
      list = list.filter((p) => p.sizes.some((s) => sizes.includes(s)));
    if (colors.length)
      list = list.filter((p) => p.colors.some((c) => colors.includes(c)));
    if (priceBand !== "any") {
      const band = PRICE_BANDS.find((b) => b.key === priceBand);
      if (band?.max) {
        list = list.filter((p) => p.price < bdt(band.max));
      } else if (priceBand === "above2500") {
        list = list.filter((p) => p.price >= bdt(2500));
      }
    }
    const query = q.trim().toLowerCase();
    if (query) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.subCategory.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query) ||
          (p.nameBn ?? "").toLowerCase().includes(query),
      );
    }
    switch (sort) {
      case "newest":
        list = [...list].reverse();
        break;
      case "price-asc":
        list = [...list].sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list = [...list].sort((a, b) => b.price - a.price);
        break;
      default:
        list = [...list].sort((a, b) => Number(b.featured) - Number(a.featured));
    }
    return list;
  }, [products, category, onlyNew, onlyInStock, sizes, colors, priceBand, q, sort]);

  const hasActiveFilters =
    category !== "all" ||
    onlyNew ||
    onlyInStock ||
    sizes.length > 0 ||
    colors.length > 0 ||
    priceBand !== "any";

  const resetAll = () => {
    setCategory("all");
    setOnlyNew(false);
    setSizes([]);
    setColors([]);
    setPriceBand("any");
    setOnlyInStock(false);
    setQ("");
  };

  const categoryCount = (id: CategoryId) =>
    products.filter((p) => p.category === id).length;

  const filterPanel = (
    <div className="space-y-8">
      {/* Categories */}
      <Fieldset title="Categories">
        <div className="space-y-1">
          {(["all", ...categories.map((c) => c.id)] as CategoryFilter[]).map(
            (id) => {
              const label = id === "all" ? "All products" : (categories.find((c) => c.id === id)?.name ?? id);
              const count =
                id === "all"
                  ? products.length
                  : categoryCount(id as CategoryId);
              return (
                <label
                  key={id}
                  className="flex cursor-pointer items-center justify-between rounded-lg px-2 py-2 text-sm transition-colors hover:bg-ivory-100"
                >
                  <span className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name="category"
                      checked={category === id}
                      onChange={() => setCategory(id)}
                      className="h-4 w-4 accent-forest-700"
                    />
                    <span
                      className={category === id ? "font-medium text-ink" : "text-ink-soft"}
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
      <Fieldset title="Price">
        <div className="space-y-1">
          {PRICE_BANDS.map((band) => (
            <label
              key={band.key}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm text-ink-soft transition-colors hover:bg-ivory-100"
            >
              <input
                type="radio"
                name="price"
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
      <Fieldset title="Size">
        <div className="flex flex-wrap gap-2">
          {ALL_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setSizes((s) => toggle(s, size))}
              aria-pressed={sizes.includes(size)}
              className={`h-9 min-w-9 rounded-full px-2.5 text-sm font-medium transition-colors ${
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

      {/* Color */}
      <Fieldset title="Colour">
        <div className="flex flex-wrap gap-2">
          {ALL_COLORS.map((color) => {
            const active = colors.includes(color);
            return (
              <button
                key={color}
                type="button"
                onClick={() => setColors((c) => toggle(c, color))}
                aria-pressed={active}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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

      {/* Availability */}
      <label className="flex cursor-pointer items-center gap-2.5 px-2 text-sm text-ink-soft">
        <input
          type="checkbox"
          checked={onlyInStock}
          onChange={(e) => setOnlyInStock(e.target.checked)}
          className="h-4 w-4 accent-forest-700"
        />
        In stock only
      </label>

      {hasActiveFilters && (
        <button
          type="button"
          onClick={resetAll}
          className="text-sm font-medium text-gold-600 underline underline-offset-4 hover:text-gold-700"
        >
          Clear all filters
        </button>
      )}
    </div>
  );

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full md:max-w-sm">
          <IconSearch className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products, SKU, categories…"
            aria-label="Search products"
            className="h-12 w-full rounded-full bg-paper pl-11 pr-4 text-sm text-ink shadow-sm ring-1 ring-line transition-shadow placeholder:text-ink-soft/60 focus:ring-2 focus:ring-forest-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-paper px-5 text-sm font-medium ring-1 ring-line lg:hidden"
          >
            Filters
            {(sizes.length > 0 || colors.length > 0 || priceBand !== "any") && (
              <span className="h-2 w-2 rounded-full bg-gold-500" />
            )}
          </button>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <span className="hidden sm:inline">Sort</span>
            <span className="relative">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort products"
                className="h-12 appearance-none rounded-full bg-paper pl-5 pr-10 text-sm font-medium text-ink ring-1 ring-line focus:ring-2 focus:ring-forest-500"
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

      <p className="mt-5 text-sm text-ink-soft">
        {visible.length} {visible.length === 1 ? "product" : "products"}
        {category !== "all" &&
          ` in ${categories.find((c) => c.id === category)?.name ?? ""}`}
        {onlyNew && " · new arrivals"}
      </p>

      {/* Desktop layout */}
      <div className="mt-6 grid gap-10 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block">
          <div className="sticky top-28">{filterPanel}</div>
        </aside>

        <div>
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
                No products found
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
                Try another search, or clear the filters to browse the full
                collection.
              </p>
              <button
                type="button"
                onClick={resetAll}
                className="mt-6 rounded-full bg-forest-800 px-6 py-3 text-sm font-medium text-ivory-50 transition-colors hover:bg-forest-700"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Product filters"
        >
          <button
            aria-label="Close filters"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-forest-950/40 backdrop-blur-sm"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-ivory-50 p-6 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-display text-xl font-semibold text-ink">
                Filters
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
            {filterPanel}
            <div className="mt-8 flex gap-3 pb-4">
              <button
                type="button"
                onClick={() => {
                  resetAll();
                  setDrawerOpen(false);
                }}
                className="h-12 flex-1 rounded-full bg-paper text-sm font-medium ring-1 ring-line"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="h-12 flex-1 rounded-full bg-forest-800 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
              >
                Show {visible.length}
              </button>
            </div>
          </div>
        </div>
      )}
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
