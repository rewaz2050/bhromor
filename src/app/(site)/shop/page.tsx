import { resolveMood } from "@/lib/merchandising";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
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
  searchParams: Promise<{
    category?: string | string[];
    filter?: string | string[];
    q?: string | string[];
    mood?: string | string[];
    price?: string | string[];
  }>;
}) {
  const params = await searchParams;
  // Categories are data-driven (§5) — validating against three hard-coded ids
  // meant any category added later silently fell back to "all".
  const category = CATEGORIES.some((c) => c.id === params.category)
    ? (params.category as string)
    : ("all" as const);
  const query = typeof params.q === "string" ? params.q : "";
  const onlyNew = params.filter === "new";

  return (
    <>
      <section className="overflow-hidden border-b border-line bg-ivory-100">
        <div className="mx-auto grid max-w-7xl md:grid-cols-[1fr_280px] lg:grid-cols-[1fr_360px]">
          <div className="px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
            <nav
              aria-label="Breadcrumb"
              className="mb-7 flex items-center gap-3 text-[0.6rem] uppercase tracking-[0.18em] text-ink-soft"
            >
              <Link href="/" className="hover:text-forest-800">
                Home
              </Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">The collection</span>
            </nav>
            <Eyebrow>Considered essentials. Distinctly you.</Eyebrow>
            <h1 className="mt-4 font-display text-4xl font-normal tracking-tight text-forest-900 sm:text-5xl lg:text-6xl">
              Shop the <span className="italic text-gold-600">collection.</span>
            </h1>
            <p className="mt-5 max-w-lg text-sm leading-7 text-ink-soft">
              Timeless silhouettes, thoughtful details. Find your favourites in
              our carefully selected edit of everyday essentials.
            </p>
            <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
              {CATEGORIES.filter((item) => item.active !== false).map(
                (item) => (
                  <Link
                    key={item.id}
                    href={`/shop?category=${item.id}`}
                    className="editorial-text-link"
                  >
                    {item.name}
                    <span className="font-bengali text-[0.6rem] text-ink-soft">
                      {item.nameBn}
                    </span>
                  </Link>
                ),
              )}
            </div>
          </div>
          <div className="relative hidden bg-ivory-200 md:block">
            <Image
              src="/images/products/panjabi-detail.jpg"
              loading="eager"
              alt=""
              fill
              sizes="(min-width: 1024px) 360px, 280px"
              className="object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-5 border border-ivory-100/50"
            />
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <ShopBrowser
          products={PRODUCTS}
          categories={CATEGORIES}
          initialCategory={category}
          initialNew={onlyNew}
          initialQuery={query}
          initialMood={resolveMood(params.mood)}
          initialPrice={params.price === "under500" ? "under500" : "any"}
        />
      </div>
    </>
  );
}
