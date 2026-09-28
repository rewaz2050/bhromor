"use client";

/**
 * Vendor product list — the shop's own catalog, drafts and archived rows
 * included, with the shelf state of every row and the one tap that
 * changes it (Publish / Unpublish / Archive / Restore). Full edits still
 * open the staff ProductEditor.
 */

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useVendor } from "@/components/vendor/vendor-shell";
import {
  EmptyState,
  ErrorBox,
  PageHeader,
  PrimaryLink,
  Skeleton,
} from "@/components/vendor/vendor-ui";
import ShelfRowActions from "@/components/admin/shelf-row-actions";
import DuplicateProductButton from "@/components/vendor/duplicate-product-button";
import BulkEditBar from "@/components/vendor/bulk-edit-bar";
import { formatBdt } from "@/lib/format";
import {
  SHELF_FILTERS,
  SHELF_META,
  shelfCounts,
  shelfState,
  type ShelfState,
} from "@/lib/product-shelf";
import { useVendorProducts } from "@/lib/use-vendor";

export default function VendorProductsPage() {
  const me = useVendor();
  const { products, loading, error, refresh, patchProduct, createProduct, saveProduct } =
    useVendorProducts(me !== null);
  const [filter, setFilter] = useState<ShelfState | "all">("all");
  const [query, setQuery] = useState("");
  // A4 (2026-09-28) — bulk price/stock. Selection is by id, so a re-filter
  // never silently drops a row the seller picked.
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkNote, setBulkNote] = useState<string | null>(null);
  // Deep link from the dashboard's restock line (/vendor/products?shelf=out).
  // Read once in an effect — useSearchParams would force a Suspense boundary.
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("shelf");
    if (wanted && SHELF_FILTERS.some((f) => f.id === wanted)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- adopt the URL once on mount
      setFilter(wanted as ShelfState | "all");
    }
  }, []);

  const counts = useMemo(() => shelfCounts(products), [products]);
  // A3 — what the shop already uses, so a duplicate never clashes with it.
  const cloneContext = useMemo(
    () => ({ slugs: products.map((p) => p.slug), skus: products.map((p) => p.sku) }),
    [products],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        (filter === "all" || shelfState(p) === filter) &&
        (q === "" ||
          p.name.toLowerCase().includes(q) ||
          (p.nameBn ?? "").toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q)),
    );
  }, [products, filter, query]);

  const attention = counts.out + counts.low;

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) for (const p of visible) next.delete(p.id);
      else for (const p of visible) next.add(p.id);
      return next;
    });
  const selectedRows = products.filter((p) => selected.has(p.id));

  return (
    <div>
      <PageHeader
        title="Products"
        sub={
          attention > 0
            ? `${counts.live + counts.low} on sale · ${counts.out} sold out · ${counts.low} running low — restock the loud ones first.`
            : "Drafts stay invisible until you publish them; archived pieces keep their order history."
        }
        action={
          <div className="flex flex-wrap gap-2">
            <PrimaryLink href="/vendor/products/quick">⚡ Quick add</PrimaryLink>
            <Link
              href="/vendor/products/new"
              className="inline-flex min-h-11 items-center rounded-full bg-paper px-5 text-sm font-semibold text-forest-800 ring-1 ring-forest-300 hover:bg-forest-50"
            >
              Full editor
            </Link>
          </div>
        }
      />

      {loading ? (
        <Skeleton lines={4} />
      ) : error ? (
        <ErrorBox message={error} onRetry={refresh} />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products yet"
          sub="Add your first product — publish it when the photos and price are ready."
          action={
          <div className="flex flex-wrap gap-2">
            <PrimaryLink href="/vendor/products/quick">⚡ Quick add</PrimaryLink>
            <Link
              href="/vendor/products/new"
              className="inline-flex min-h-11 items-center rounded-full bg-paper px-5 text-sm font-semibold text-forest-800 ring-1 ring-forest-300 hover:bg-forest-50"
            >
              Full editor
            </Link>
          </div>
        }
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter products">
              {SHELF_FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  aria-pressed={filter === f.id}
                  onClick={() => setFilter(f.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filter === f.id
                      ? "bg-forest-800 text-ivory-50"
                      : "bg-paper text-ink-soft ring-1 ring-line hover:text-forest-900"
                  }`}
                >
                  {f.label}
                  <span
                    className={`rounded-full px-1.5 text-[0.65rem] font-bold ${
                      filter === f.id ? "bg-white/20" : "bg-ivory-100"
                    }`}
                  >
                    {counts[f.id]}
                  </span>
                </button>
              ))}
            </div>
            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={toggleAllVisible}
                aria-label="Select all shown products"
                className="h-4 w-4 accent-forest-800"
              />
              Select all
            </label>
            <label className="ml-auto flex min-w-[12rem] flex-1 items-center sm:max-w-xs">
              <span className="sr-only">Search products</span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or SKU"
                className="w-full rounded-full bg-paper px-4 py-2 text-sm ring-1 ring-line placeholder:text-ink-soft/60 focus:outline-none focus:ring-2 focus:ring-forest-400"
              />
            </label>
          </div>

          {selectedRows.length > 0 && (
            <BulkEditBar
              products={selectedRows}
              onApply={(product) => saveProduct(product, false)}
              onDone={(saved) => {
                setBulkNote(`${saved} ${saved === 1 ? "product" : "products"} updated.`);
                setSelected(new Set());
              }}
            />
          )}
          {bulkNote && (
            <p role="status" className="mb-3 text-xs font-semibold text-forest-800">
              {bulkNote}
            </p>
          )}

          {visible.length === 0 ? (
            <EmptyState
              title="Nothing matches"
              sub="Try another filter or clear the search."
            />
          ) : (
            <ul className="space-y-2">
              {visible.map((p) => {
                const state = shelfState(p);
                const meta = SHELF_META[state];
                const cover = p.media.find((m) => m.kind !== "video") ?? p.media[0];
                // Per-size stock (UX plan §4, R10): name the sizes that are
                // gone so the seller restocks the right one, not "some".
                const goneSizes = p.sizeStock
                  ? p.sizes.filter((sz) => (p.sizeStock?.[sz] ?? 1) === 0)
                  : [];
                const stockLine =
                  typeof p.stock === "number"
                    ? p.stock === 0
                      ? "0 in stock"
                      : `${p.stock} in stock${
                          goneSizes.length > 0 && goneSizes.length < p.sizes.length
                            ? ` · ${goneSizes.join(", ")} sold out`
                            : ""
                        }`
                    : p.inStock
                      ? "in stock"
                      : "out of stock";
                return (
                  <li
                    key={p.id}
                    className="rounded-2xl bg-paper px-4 py-3 ring-1 ring-line"
                    data-testid="vendor-product-row"
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleRow(p.id)}
                        aria-label={`Select ${p.name}`}
                        className="mt-1 h-4 w-4 shrink-0 accent-forest-800"
                      />
                      <Link
                        href={`/vendor/products/${encodeURIComponent(p.id)}`}
                        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-ivory-100 ring-1 ring-line"
                        aria-label={`Edit ${p.name}`}
                      >
                        {cover ? (
                          <Image
                            src={cover.src}
                            alt=""
                            fill
                            sizes="56px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-[0.6rem] font-semibold uppercase tracking-wide text-ink-soft">
                            No photo
                          </span>
                        )}
                      </Link>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/vendor/products/${encodeURIComponent(p.id)}`}
                            className="truncate text-sm font-semibold text-forest-900 hover:underline"
                          >
                            {p.name}
                          </Link>
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide ring-1 ${meta.cls}`}
                            title={meta.hint}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {p.sku} · {formatBdt(p.price)} ·{" "}
                          <span
                            className={
                              state === "out"
                                ? "font-semibold text-rose-700"
                                : state === "low"
                                  ? "font-semibold text-amber-800"
                                  : ""
                            }
                          >
                            {stockLine}
                          </span>
                          {typeof p.unitsSold === "number" && p.unitsSold > 0
                            ? ` · ${p.unitsSold} sold`
                            : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <ShelfRowActions product={p} onPatch={patchProduct} size="sm" />
                          <DuplicateProductButton
                            product={p}
                            context={cloneContext}
                            create={createProduct}
                          />
                          {(state === "out" || state === "low") && (
                            <Link
                              href={`/vendor/products/${encodeURIComponent(p.id)}`}
                              className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[0.7rem] font-semibold text-amber-900 hover:bg-amber-100"
                            >
                              Restock →
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
