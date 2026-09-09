"use client";

/**
 * Vendor product edit page (marketplace slice 3). The product comes from
 * the vendor's own catalog — another shop's id simply isn't in the list.
 */

import { use } from "react";
import Link from "next/link";
import { useVendor } from "@/components/vendor/vendor-shell";
import {
  EmptyState,
  ErrorBox,
  PageHeader,
  Skeleton,
} from "@/components/vendor/vendor-ui";
import ProductEditor from "@/components/admin/product-editor";
import { useVendorCategories, useVendorProducts } from "@/lib/use-vendor";

export default function VendorEditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const productId = decodeURIComponent(id);
  const me = useVendor();
  const authed = me !== null;
  const {
    products,
    loading: productsLoading,
    error: productsError,
    saveProduct,
    saveError,
    refresh,
  } = useVendorProducts(authed);
  const { categories, loading: catsLoading } = useVendorCategories(authed);

  const loading = productsLoading || catsLoading;
  const product = products.find((p) => p.id === productId) ?? null;

  return (
    <div>
      <PageHeader title="Edit product" />
      {loading ? (
        <Skeleton lines={3} />
      ) : productsError ? (
        <ErrorBox message={productsError} onRetry={refresh} />
      ) : !product ? (
        <div>
          <EmptyState
            title="Product not found"
            sub="It may belong to another shop, or it was deleted."
          />
          <p className="mt-4">
            <Link
              href="/vendor/products"
              className="text-sm font-semibold text-forest-800 underline underline-offset-2"
            >
              ← Back to products
            </Link>
          </p>
        </div>
      ) : (
        <ProductEditor
          product={product}
          categoriesList={categories.map((c) => ({
            id: String(c.id),
            name: c.name,
            subCategories: c.subCategories,
          }))}
          products={products}
          saveError={saveError}
          onSave={saveProduct}
          redirectTo="/vendor/products"
          hideCuration
        />
      )}
    </div>
  );
}
