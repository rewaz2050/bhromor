"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCatalog } from "@/lib/use-catalog";
import ProductEditor from "@/components/admin/product-editor";

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const { products, categories } = useCatalog();
  const product = products.find((p) => p.id === params.id);

  if (!product) {
    return (
      <div className="rounded-2xl bg-paper py-20 text-center ring-1 ring-line">
        <p className="font-display text-lg text-forest-900">Product not found</p>
        <p className="mt-1 text-sm text-ink-soft">
          It may belong to a different demo dataset.
        </p>
        <Link
          href="/admin/products"
          className="mt-6 inline-flex rounded-full bg-forest-800 px-6 py-2.5 text-sm font-medium text-ivory-50 hover:bg-forest-700"
        >
          Back to products
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/admin/products"
          className="text-sm text-ink-soft transition-colors hover:text-forest-800"
        >
          ← Products
        </Link>
        <h2 className="font-display mt-2 text-xl font-medium text-forest-900">
          {product.name}
        </h2>
      </div>
      <ProductEditor product={product} categoriesList={categories} />
    </div>
  );
}
