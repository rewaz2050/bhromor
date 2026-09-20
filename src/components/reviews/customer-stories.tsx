"use client";

import Image from "next/image";
import Link from "next/link";
import { usePublicReviews } from "@/lib/use-public-reviews";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { coverImage, type Product } from "@/lib/catalog";
import { isDiscoverable } from "@/lib/merchandising";
import { averageOf, type Review } from "@/lib/review-store";
import { Eyebrow } from "@/components/ui/primitives";
import { IconStar } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";

/** `products` is the SERVING catalog the caller resolves live — no seeds. */
export function approvedStories(reviews: Review[], products: Product[]) {
  return reviews
    .filter(
      (r) =>
        r.status === "approved" &&
        Number.isFinite(r.rating) &&
        r.rating >= 1 &&
        r.rating <= 5 &&
        products.some((p) => p.id === r.productId && isDiscoverable(p)),
    )
    .sort(
      (a, b) => Number(!!b.featured) - Number(!!a.featured) || b.date - a.date,
    );
}

/**
 * Real, approved reviews — the strongest thing a new shopper can see.
 *
 * `hideWhenEmpty` is what the homepage passes: with no approved review there
 * is no block at all (a "be the first" card on the front page reads as
 * "nobody buys here"). Stand-alone pages keep the honest empty state.
 */
export default function CustomerStories({
  hideWhenEmpty = false,
  limit = 3,
}: {
  hideWhenEmpty?: boolean;
  limit?: number;
} = {}) {
  const { t } = useLanguage();
  const { reviews } = usePublicReviews({ featured: true });
  const { products } = useLiveCatalog();
  const approved = approvedStories(reviews ?? [], products);

  if (hideWhenEmpty && approved.length === 0) return null;

  return (
    <section
      aria-labelledby="stories-heading"
      data-testid="customer-stories"
      className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24"
    >
      <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
        <div>
          <Eyebrow>{t("home.storiesEyebrow")}</Eyebrow>
          <h2
            id="stories-heading"
            className="mt-4 font-display text-4xl text-forest-900 sm:text-5xl"
          >
            {t("home.storiesTitle")}
          </h2>
        </div>
        {approved.length > 0 && (
          <div className="text-forest-900">
            <p className="font-display text-4xl">
              {averageOf(approved).toFixed(1)}{" "}
              <span className="text-xl text-ink-soft">/ 5</span>
            </p>
            <p className="mt-2 text-xs text-ink-soft">
              {approved.length === 1
                ? t("home.storiesAcrossOne")
                : t("home.storiesAcross").replace("{count}", String(approved.length))}
            </p>
          </div>
        )}
      </div>
      {approved.length ? (
        <div className="grid gap-5 md:grid-cols-3">
          {approved.slice(0, limit).map((review) => {
            const product = products.find((p) => p.id === review.productId);
            if (!product) return null;
            const cover = coverImage(product);
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
                    {review.verified ? `· ${t("home.verifiedPurchase")}` : ""}
                  </span>
                </p>
                <Link
                  href={`/product/${product.slug}#reviews-heading`}
                  className="mt-4 flex items-center gap-3 self-start text-sm font-medium text-forest-800 hover:text-forest-950"
                >
                  {cover.src ? (
                    <span className="relative block h-12 w-10 shrink-0 overflow-hidden bg-ivory-100">
                      <Image
                        src={cover.src}
                        alt=""
                        aria-hidden="true"
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    </span>
                  ) : null}
                  <span className="editorial-text-link">{product.name} →</span>
                </Link>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="border border-dashed border-line bg-ivory-100/50 px-6 py-12 text-center">
          <h3 className="font-display text-2xl text-forest-900">
            {t("home.storiesEmptyTitle")}
          </h3>
          <p className="mt-3 text-sm text-ink-soft">{t("home.storiesEmptyBody")}</p>
          <Link href="/shop" className="editorial-text-link mt-5">
            {t("home.storiesExplore")} →
          </Link>
        </div>
      )}
    </section>
  );
}
