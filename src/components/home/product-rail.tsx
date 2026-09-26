"use client";

import Link from "next/link";
import ListImpression from "@/components/analytics/list-impression";
import ProductCard from "@/components/product/product-card";
import Reveal from "@/components/ui/reveal";
import { Eyebrow } from "@/components/ui/primitives";
import { IconArrowRight } from "@/components/ui/icons";
import type { Product } from "@/lib/catalog";

/**
 * One horizontal product rail (Batch J): eyebrow + heading + a snap-scrolling
 * row on phones that becomes a 4-column grid from `sm`. The heading itself is
 * the link (Baymard: users try to click section headers), and the "See all"
 * chip carries the FULL scope in its label so a phone user knows the next
 * screen is a filtered list, not the whole shop.
 */
export default function ProductRail({
  id,
  eyebrow,
  title,
  sub,
  href,
  seeAllLabel,
  products,
  tone = "paper",
  testId,
}: {
  id: string;
  eyebrow?: string;
  title: string;
  sub?: string;
  href: string;
  seeAllLabel: string;
  products: Product[];
  tone?: "paper" | "ivory";
  testId?: string;
}) {
  if (products.length === 0) return null;
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-testid={testId}
      data-list={id}
      className={`scroll-mt-24 ${tone === "ivory" ? "bg-ivory-50" : "border-y border-line bg-paper"}`}
    >
      <ListImpression list={id} count={products.length} />
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 sm:mb-8">
          <div className="max-w-2xl">
            {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
            <h2
              id={headingId}
              className="mt-2 font-display text-[clamp(1.85rem,3.6vw,3rem)] font-normal leading-[1.05] tracking-[-0.03em] text-forest-900"
            >
              <Link href={href} className="transition-colors hover:text-forest-700">
                {title}
              </Link>
            </h2>
            {sub && <p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">{sub}</p>}
          </div>
          <Link href={href} className="editorial-text-link group shrink-0">
            {seeAllLabel}
            <IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </Reveal>

        <div className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-3 [scrollbar-width:thin] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-10 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 lg:gap-x-7">
          {products.map((product, index) => (
            <Reveal
              key={product.id}
              delay={Math.min(index, 3) * 70}
              className="w-[68vw] min-w-[220px] max-w-[300px] shrink-0 snap-start sm:w-auto sm:min-w-0 sm:max-w-none"
            >
              <ProductCard product={product} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
