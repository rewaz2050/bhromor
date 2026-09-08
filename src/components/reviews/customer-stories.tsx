"use client";

import Link from "next/link";
import { useReviews } from "@/lib/use-reviews";
import { PRODUCTS } from "@/lib/catalog";
import { isDiscoverable } from "@/lib/merchandising";
import { averageOf, type Review } from "@/lib/review-store";
import { Eyebrow } from "@/components/ui/primitives";
import { IconStar } from "@/components/ui/icons";

export function approvedStories(reviews: Review[]) {
  return reviews
    .filter(
      (r) =>
        r.status === "approved" &&
        Number.isFinite(r.rating) &&
        r.rating >= 1 &&
        r.rating <= 5 &&
        PRODUCTS.some((p) => p.id === r.productId && isDiscoverable(p)),
    )
    .sort(
      (a, b) => Number(!!b.featured) - Number(!!a.featured) || b.date - a.date,
    );
}

export default function CustomerStories() {
  const { reviews } = useReviews();
  const approved = approvedStories(reviews);
  return (
    <section
      aria-labelledby="stories-heading"
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
    >
      <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>Customer stories</Eyebrow>
          <h2
            id="stories-heading"
            className="mt-4 font-display text-4xl text-forest-900 sm:text-5xl"
          >
            Comfort, in their words.
          </h2>
          <p className="mt-4 max-w-xl border-l-2 border-gold-400 pl-3 text-xs leading-6 text-ink-soft">
            Preview content: these reviews come from the demo review store,
            including sample entries and browser-local submissions. They are not
            verified customer proof.
          </p>
        </div>
        {approved.length > 0 && (
          <div className="text-forest-900">
            <p className="font-display text-4xl">
              {averageOf(approved).toFixed(1)}{" "}
              <span className="text-xl text-ink-soft">/ 5</span>
            </p>
            <p className="mt-2 text-xs text-ink-soft">
              Across {approved.length} approved demo reviews
            </p>
          </div>
        )}
      </div>
      {approved.length ? (
        <div className="grid gap-5 md:grid-cols-3">
          {approved.slice(0, 3).map((review) => {
            const product = PRODUCTS.find((p) => p.id === review.productId)!;
            return (
              <article
                key={review.id}
                className="flex flex-col border border-line bg-paper p-6 sm:p-8"
              >
                <div
                  className="flex gap-1"
                  role="img"
                  aria-label={`${review.rating} out of 5 stars`}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <IconStar
                      key={n}
                      className={`h-4 w-4 ${n <= Math.round(review.rating) ? "text-gold-600" : "text-ivory-200"}`}
                    />
                  ))}
                </div>
                <blockquote className="mt-6 flex-1 font-display text-xl leading-8 text-forest-900">
                  “{review.body}”
                </blockquote>
                <p className="mt-6 text-xs font-medium text-ink">
                  {review.author}{" "}
                  <span className="font-normal text-ink-soft">
                    · Demo review
                  </span>
                </p>
                <Link
                  href={`/product/${product.slug}#reviews-heading`}
                  className="editorial-text-link mt-4 self-start"
                >
                  {product.name} →
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="border border-dashed border-line bg-ivory-100/50 px-6 py-12 text-center">
          <h3 className="font-display text-2xl text-forest-900">
            Your story could be the first.
          </h3>
          <p className="mt-3 text-sm text-ink-soft">
            No approved reviews to display yet.
          </p>
          <Link href="/shop" className="editorial-text-link mt-5">
            Explore the collection →
          </Link>
        </div>
      )}
    </section>
  );
}
