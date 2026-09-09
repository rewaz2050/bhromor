"use client";

/**
 * Vendor new-product page (marketplace slice 3): the staff ProductEditor
 * with a vendor catalog source, vendor save sink, and curation hidden
 * (homepage badges are platform-owned).
 */

import { useVendor } from "@/components/vendor/vendor-shell";
import { ErrorBox, PageHeader, Skeleton } from "@/components/vendor/vendor-ui";
import ProductEditor from "@/components/admin/product-editor";
import { useVendorCategories, useVendorProducts } from "@/lib/use-vendor";

export default function VendorNewProductPage() {
  const me = useVendor();
  const authed = me !== null;
  const { products, saveProduct, saveError } = useVendorProducts(authed);
  const { categories, loading, error, refresh } = useVendorCategories(authed);

  return (
    <div>
      <PageHeader
        title="New product"
        sub="Create it as a draft, or publish straight away."
      />
      {loading ? (
        <Skeleton lines={3} />
      ) : error ? (
        <ErrorBox message={error} onRetry={refresh} />
      ) : (
        <ProductEditor
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
