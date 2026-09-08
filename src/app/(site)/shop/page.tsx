import type { Metadata } from "next";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import ShopBrowser from "@/components/shop/shop-browser";
import { Eyebrow } from "@/components/ui/primitives";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Browse the PROSANTI catalog — premium panjabi, shirts, three-piece, lungi and gamcha, with transparent pricing and rapid delivery.",
};

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; filter?: string }>;
}) {
  const params = await searchParams;
  // Categories are data-driven (§5) — validating against three hard-coded ids
  // meant any category added later silently fell back to "all".
  const category = CATEGORIES.some((c) => c.id === params.category)
    ? (params.category as string)
    : ("all" as const);
  const onlyNew = params.filter === "new";

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
      <Eyebrow>The collection</Eyebrow>
      <h1 className="font-display mt-3 text-4xl font-medium tracking-tight text-forest-900 sm:text-5xl">
        Shop
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-ink-soft">
        Every product below is part of our current, carefully selected catalog.
        Filters and sorting run instantly — choose a category, size or colour
        to narrow the edit.
      </p>

      <div className="mt-10">
        <ShopBrowser
          products={PRODUCTS}
          categories={CATEGORIES}
          initialCategory={category}
          initialNew={onlyNew}
        />
      </div>
    </div>
  );
}
