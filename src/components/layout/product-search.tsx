"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Drawer from "@/components/ui/drawer";
import { IconArrowRight, IconClose, IconSearch } from "@/components/ui/icons";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { matchesProduct, shopSearchHref } from "@/lib/product-search";

export default function ProductSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searching = query.trim().length > 0;
  const matches = searching
    ? PRODUCTS.filter((product) => matchesProduct(product, query))
    : [];
  const suggestions = searching
    ? matches.slice(0, 5)
    : PRODUCTS.filter((product) => product.featured).slice(0, 3);
  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        aria-label="Search products"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setQuery("");
          setOpen(true);
        }}
        className="header-icon-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:text-forest-900"
      >
        <IconSearch className="h-[1.15rem] w-[1.15rem]" />
      </button>
      <Drawer
        open={open}
        onClose={close}
        label="Search the collection"
        side="right"
        initialFocusRef={inputRef}
        panelClassName="!w-full !max-w-none lg:px-[max(2rem,calc((100vw-900px)/2))]"
      >
        <div className="sticky top-0 z-10 border-b border-line bg-ivory-50 px-5 pb-5 pt-6 sm:px-8">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-ink-soft">
                Find your everyday favourite
              </p>
              <h2 className="mt-2 font-display text-2xl text-forest-900">
                What are you looking for?
              </h2>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close search"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-forest-100"
            >
              <IconClose />
            </button>
          </div>
          <form
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              router.push(shopSearchHref(query));
              close();
            }}
          >
            <label htmlFor="header-product-search" className="sr-only">
              Search by name, category or SKU
            </label>
            <div className="flex items-center gap-2 rounded-2xl bg-paper px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-forest-500">
              <IconSearch className="h-5 w-5 shrink-0 text-ink-soft" />
              <input
                ref={inputRef}
                id="header-product-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Panjabi, shirts, gamcha…"
                autoComplete="off"
                className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none focus-visible:outline-none"
              />
              <button
                type="submit"
                aria-label="View search results"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-forest-800 text-ivory-50 hover:bg-forest-700"
              >
                <IconArrowRight />
              </button>
            </div>
            <p className="mt-3 text-xs text-ink-soft">
              Search in English or বাংলা. Find something that feels like you.
            </p>
          </form>
        </div>
        <div className="flex-1 px-5 py-6 sm:px-8">
          {!searching && (
            <div className="mb-8">
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-soft">
                Explore collections
              </h3>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((category) => (
                  <Link
                    key={category.id}
                    href={`/shop?category=${encodeURIComponent(category.id)}`}
                    onClick={close}
                    className="rounded-full px-4 py-3 text-sm text-forest-800 ring-1 ring-line hover:bg-forest-100"
                  >
                    {category.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {!searching && (
            <div className="mb-8">
              <h3 className="mb-3 text-xs uppercase tracking-widest text-ink-soft">
                Find your essentials
              </h3>
              <div className="flex flex-wrap gap-2">
                {["Panjabi", "Shirt", "Lungi", "Gamcha", "Three-Piece"].map(
                  (term) => (
                    <button
                      key={term}
                      onClick={() => setQuery(term)}
                      className="min-h-11 border border-line px-4 text-sm hover:bg-forest-100"
                    >
                      {term}
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
          <p
            role="status"
            aria-live="polite"
            className="mb-4 break-words text-sm text-ink-soft"
          >
            {searching
              ? `${matches.length} ${matches.length === 1 ? "match" : "matches"} for “${query.trim()}”`
              : "A few favourites to get you started"}
          </p>
          {searching && matches.length === 0 ? (
            <div className="rounded-2xl bg-ivory-100 px-5 py-8 text-center">
              <h3 className="font-display text-xl text-forest-900">
                No matches just yet
              </h3>
              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Try a product name like panjabi or gamcha, or explore the full
                collection.
              </p>
              <Link
                href="/shop"
                onClick={close}
                className="mt-5 inline-flex min-h-11 items-center font-medium text-forest-800 underline underline-offset-4"
              >
                Browse all products
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {suggestions.map((product) => (
                <li key={product.id}>
                  <Link
                    href={`/product/${product.slug}`}
                    onClick={close}
                    className="group flex items-center gap-4 rounded-xl py-4 transition-colors hover:bg-ivory-100"
                  >
                    <div className="relative h-24 w-20 shrink-0 overflow-hidden rounded-xl bg-ivory-100">
                      {product.media[0] && (
                        <Image
                          src={product.media[0].src}
                          alt=""
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.65rem] uppercase tracking-widest text-ink-soft">
                        {product.subCategory}
                      </p>
                      <h3 className="mt-1 font-display text-lg leading-snug text-forest-900 group-hover:underline">
                        {product.name}
                      </h3>
                      <p className="mt-2 text-sm font-medium text-ink">
                        {formatBdt(product.price)}
                        {!product.inStock && (
                          <span className="ml-2 text-xs font-normal text-ink-soft">
                            Sold out
                          </span>
                        )}
                      </p>
                    </div>
                    <IconArrowRight className="h-4 w-4 shrink-0 text-ink-soft" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        {(!searching || matches.length > 0) && (
          <div className="sticky bottom-0 border-t border-line bg-ivory-50 px-5 py-5 sm:px-8">
            <Link
              href={shopSearchHref(query)}
              onClick={close}
              className="flex min-h-12 items-center justify-center gap-3 rounded-full bg-forest-800 px-5 py-3 text-sm font-semibold text-ivory-50 hover:bg-forest-700"
            >
              {searching
                ? `View ${matches.length === 1 ? "1 result" : `all ${matches.length} results`}`
                : "Shop the full collection"}
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </Drawer>
    </>
  );
}
