"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCatalog } from "@/lib/use-catalog";
import { formatBdt } from "@/lib/format";
import {
  SHELF_FILTERS,
  SHELF_META,
  shelfCounts,
  shelfState,
  type ShelfState,
} from "@/lib/product-shelf";
import ShelfRowActions from "@/components/admin/shelf-row-actions";
import {
  IconPlus,
  IconSearch,
  IconStar,
} from "@/components/ui/icons";

type Vis = ShelfState | "all";

/** §72–74 product management list. */
export default function AdminProductsPage() {
  const { products, categories, loading, error, clearError, toggleFlag, patchProduct } =
    useCatalog();
  const [vis, setVis] = useState<Vis>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  // Shelf state (Live / Low / Sold out / Draft / Archived) is the same
  // model the vendor list uses (product-shelf.ts). Until 2026-09-18 a
  // sold-out piece hid inside "Published" and the stock column guessed
  // 3 / 12 units for rows without a count.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => (vis === "all" ? true : shelfState(p) === vis))
      .filter((p) => (category === "all" ? true : p.category === category))
      .filter(
        (p) =>
          q === "" ||
          p.name.toLowerCase().includes(q) ||
          (p.nameBn ?? "").toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.subCategory.toLowerCase().includes(q),
      );
  }, [products, vis, query, category]);

  const counts = useMemo(() => shelfCounts(products), [products]);
  const countOf = (id: Vis) => counts[id];

  if (loading) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading catalog">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-ivory-200" />
        <div className="h-40 animate-pulse rounded-2xl bg-paper ring-1 ring-line" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">
          {error}{" "}
          <button
            type="button"
            onClick={clearError}
            className="underline underline-offset-2"
          >
            Dismiss
          </button>
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-medium text-forest-900">
          Catalog
        </h2>
        <Link
          href="/admin/products/new"
          className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
        >
          <IconPlus className="h-4 w-4" /> New product
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, SKU, subcategory…"
            aria-label="Search products"
            className="w-full rounded-full border-0 bg-paper py-2.5 pl-10 pr-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/70 focus:outline-none focus:ring-2 focus:ring-forest-600"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="rounded-full border-0 bg-paper px-4 py-2.5 text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-forest-600"
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by visibility">
        {SHELF_FILTERS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setVis(v.id)}
            aria-pressed={vis === v.id}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors ${
              vis === v.id
                ? "bg-forest-800 text-ivory-50"
                : "bg-paper text-ink-soft ring-1 ring-line hover:text-forest-800"
            }`}
          >
            {v.label}
            <span
              className={`rounded-full px-1.5 text-[0.65rem] font-bold ${
                vis === v.id
                  ? "bg-white/20 text-ivory-50"
                  : "bg-ivory-100 text-ink-soft"
              }`}
            >
              {countOf(v.id)}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-paper py-20 text-center ring-1 ring-line">
          <p className="font-display text-lg text-forest-900">No products here</p>
          <p className="mt-1 text-sm text-ink-soft">
            Try another filter, or add the first product of this batch.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[0.68rem] uppercase tracking-[0.16em] text-ink-soft">
                  <th className="px-5 py-3.5 font-semibold">Product</th>
                  <th className="px-5 py-3.5 font-semibold">Category</th>
                  <th className="px-5 py-3.5 font-semibold">Price</th>
                  <th className="px-5 py-3.5 font-semibold">Stock</th>
                  <th className="px-5 py-3.5 font-semibold">State</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((p) => {
                  const state = shelfState(p);
                  const shelf = SHELF_META[state];
                  const stock = typeof p.stock === "number" ? p.stock : null;
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-ivory-100/70">
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/products/${p.id}`} className="flex items-center gap-3">
                          <Image
                            src={p.media[0]?.src ?? ""}
                            alt=""
                            width={44}
                            height={44}
                            className="h-11 w-11 shrink-0 rounded-lg bg-ivory-100 object-cover"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink hover:text-forest-800">
                              {p.name}
                            </span>
                            <span className="mt-0.5 block text-xs text-ink-soft">
                              {p.sku} · {p.id}
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-ink-soft">
                        {categories.find((c) => c.id === p.category)?.name ?? p.category}
                        <span className="block text-xs">/{p.subCategory}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-ink">{formatBdt(p.price)}</span>
                        {p.compareAtPrice && (
                          <span className="block text-xs text-ink-soft line-through">
                            {formatBdt(p.compareAtPrice)}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${
                            state === "out"
                              ? "bg-rose-100 text-rose-800"
                              : state === "low"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {state === "out"
                            ? "Out of stock"
                            : stock === null
                              ? "In stock"
                              : `${stock} in stock`}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {p.featured && (
                            <span className="rounded-full bg-gold-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-gold-700">
                              Featured
                            </span>
                          )}
                          {p.isNew && (
                            <span className="rounded-full bg-forest-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-forest-800">
                              New
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ring-1 ${shelf.cls}`}
                            title={shelf.hint}
                          >
                            {shelf.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => void toggleFlag(p.id, "featured", !p.featured)}
                            aria-pressed={p.featured}
                            aria-label={p.featured ? "Unfeature" : "Feature"}
                            title="Toggle featured"
                            className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                              p.featured
                                ? "bg-gold-100 text-gold-600"
                                : "text-ink-soft hover:bg-ivory-100"
                            }`}
                          >
                            <IconStar className="h-4 w-4" />
                          </button>
                          <Link
                            href={`/admin/products/${p.id}`}
                            className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-forest-800 ring-1 ring-forest-300 transition-colors hover:bg-forest-800 hover:text-ivory-50"
                          >
                            Edit
                          </Link>
                          <ShelfRowActions product={p} onPatch={patchProduct} size="sm" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-xs leading-5 text-ink-soft">
        Live catalog — changes persist to the database and are served to the
        storefront immediately.
      </p>
    </div>
  );
}
