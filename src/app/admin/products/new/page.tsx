"use client";

import { useCatalog } from "@/lib/use-catalog";
import ProductEditor from "@/components/admin/product-editor";

export default function NewProductPage() {
  const { categories } = useCatalog();
  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-xl font-medium text-forest-900">
          New product
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Create it as a draft, or publish straight away (§73).
        </p>
      </div>
      <ProductEditor categoriesList={categories} />
    </div>
  );
}
