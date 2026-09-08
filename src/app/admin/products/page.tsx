"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCatalog } from "@/lib/use-catalog";
import { formatBdt } from "@/lib/format";
import {
  IconPlus,
  IconSearch,
  IconStar,
} from "@/components/ui/icons";

type Vis = "all" | "published" | "draft" | "archived";

const VIS: { id: Vis; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "draft", label: "Drafts" },
  { id: "archived", label: "Archived" },
];

const visOf = (p: {
  active?: boolean;
  status?: "draft" | "published";
}): Vis =>
  p.active === false ? "archived" : p.status === "draft" ? "draft" : "published";

const stockOf = (p: {
  stock?: number;
  inStock: boolean;
  lowStock?: boolean;
}): number => p.stock ?? (p.inStock ? (p.lowStock ? 3 : 12) : 0);

/** §72–74 product management list (demo catalog store). */
export default function AdminProductsPage() {
  const { products, categories, toggleFlag, setProductActive } = useCatalog();
  const [vis, setVis] = useState<Vis>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products
      .filter((p) => (vis === "all" ? true : visOf(p) === vis))
      .filter((p) => (category === "all" ? true : p.category === category))
      .filter(
        (p) =>
          q === "" ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.subCategory.toLowerCase().includes(q),
      );
  }, [products, vis, query, category]);

  const countOf = (id: Vis) =>
    id === "all"
      ? products.length
      : products.filter((p) => visOf(p) === id).length;

  return (
    <div className="space-y-6">
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
        {VIS.map((v) => (
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
                  const stock = stockOf(p);
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
                            stock === 0
                              ? "bg-rose-100 text-rose-800"
                              : stock <= 5
                                ? "bg-amber-100 text-amber-900"
                                : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {stock === 0 ? "Out of stock" : `${stock} in stock`}
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
                          {p.active === false ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-rose-800">
                              Archived
                            </span>
                          ) : p.status === "draft" ? (
                            <span className="rounded-full bg-ivory-200 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-ink-soft">
                              Draft
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-emerald-800">
                              Live
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => toggleFlag(p.id, "featured", !p.featured)}
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
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  p.active === false
                                    ? `Restore “${p.name}” to the catalog?`
                                    : `Archive “${p.name}”? It stays in history and can be restored anytime (§74).`,
                                )
                              ) {
                                setProductActive(p.id, p.active === false);
                              }
                            }}
                            className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:text-rose-700 hover:ring-rose-300"
                          >
                            {p.active === false ? "Restore" : "Archive"}
                          </button>
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
        Demo catalog store — changes persist in this browser and preview in
        this panel. Public storefront pages still read{" "}
        <code className="rounded bg-ivory-100 px-1 py-0.5">src/lib/catalog.ts</code>{" "}
        until the Supabase data layer gates all reads.
      </p>
    </div>
  );
}
