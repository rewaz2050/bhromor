"use client";

/**
 * Vendor product list (marketplace slice 3): own catalog incl. drafts,
 * with archive state visible. Editing reuses the staff ProductEditor.
 */

import Link from "next/link";
import { useVendor } from "@/components/vendor/vendor-shell";
import {
  EmptyState,
  ErrorBox,
  PageHeader,
  PrimaryLink,
  Skeleton,
} from "@/components/vendor/vendor-ui";
import { formatBdt } from "@/lib/format";
import { useVendorProducts } from "@/lib/use-vendor";

export default function VendorProductsPage() {
  const me = useVendor();
  const { products, loading, error, refresh } = useVendorProducts(me !== null);

  return (
    <div>
      <PageHeader
        title="Products"
        sub="Your shop's catalog — drafts stay invisible until published."
        action={<PrimaryLink href="/vendor/products/new">+ New product</PrimaryLink>}
      />

      {loading ? (
        <Skeleton lines={4} />
      ) : error ? (
        <ErrorBox message={error} onRetry={refresh} />
      ) : products.length === 0 ? (
        <EmptyState
          title="No products yet"
          sub="Add your first product — publish it when the photos and price are ready."
          action={<PrimaryLink href="/vendor/products/new">+ New product</PrimaryLink>}
        />
      ) : (
        <ul className="space-y-2">
          {products.map((p) => (
            <li key={p.id}>
              <Link
                href={`/vendor/products/${encodeURIComponent(p.id)}`}
                className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3 ring-1 ring-line transition hover:ring-forest-400"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-forest-900">
                    {p.name}
                  </p>
                  <p className="text-xs text-ink-soft">
                    {p.sku} · {formatBdt(p.price)} ·{" "}
                    {p.stock ?? (p.inStock ? "in stock" : "out of stock")}
                    {typeof p.stock === "number" ? " in stock" : ""}
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${
                    !p.active
                      ? "bg-stone-200 text-stone-600 ring-stone-300"
                      : p.status === "published"
                        ? "bg-forest-100 text-forest-900 ring-forest-200"
                        : "bg-amber-100 text-amber-900 ring-amber-200"
                  }`}
                >
                  {!p.active
                    ? "Archived"
                    : p.status === "published"
                      ? "Published"
                      : "Draft"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
