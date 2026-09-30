"use client";

import { productHref } from "@/lib/product-url";
import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { usePublicReviews } from "@/lib/use-public-reviews";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import { coverImage } from "@/lib/catalog";
import { approvedStories, storyPhotos } from "@/components/reviews/customer-stories";
import { IconBanknote, IconClock, IconShield, IconStore, IconStar } from "@/components/ui/icons";

/**
 * Pattern-interrupts for the whole shelf (UX plan §2, R10). A long run of
 * identical product grids makes the thumb stop; these two short bands break
 * the rhythm without adding a scroll's worth of height:
 *   • WhyBand — four true-for-every-order facts (local shops · 45 min · COD
 *     · delivery PIN), each a link to the page that proves it;
 *   • ReviewInterrupt — ONE real, approved review with the buyer's photo;
 *     renders nothing when no such review exists (never a seed).
 */

const WHY = [
  { icon: IconStore, key: "local" as const, href: "/shops" },
  { icon: IconClock, key: "fast" as const, href: "/delivery" },
  { icon: IconBanknote, key: "cod" as const, href: "/faq" },
  { icon: IconShield, key: "pin" as const, href: "/track" },
];

export function WhyBand() {
  const { t } = useLanguage();
  return (
    <section
      aria-label={t("home.whyTitle")}
      data-testid="why-band"
      className="border-y border-line bg-forest-900 text-ivory-50"
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <p className="text-center text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-gold-300">
          {t("home.whyEyebrow")}
        </p>
        <h2 className="mt-2 text-center font-display text-2xl leading-tight sm:text-3xl">
          {t("home.whyTitle")}
        </h2>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {WHY.map(({ icon: Icon, key, href }) => (
            <li key={key}>
              <Link
                href={href}
                className="flex min-h-11 items-start gap-3 rounded-md bg-white/[0.06] p-3.5 ring-1 ring-white/10 transition-colors hover:bg-white/[0.1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-300 sm:p-4"
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-gold-300" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-5">{t(`home.why_${key}`)}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-ivory-100/70">
                    {t(`home.why_${key}Sub`)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function ReviewInterrupt() {
  const { t } = useLanguage();
  const { reviews } = usePublicReviews({ featured: true });
  const { products, shops } = useLiveCatalog();
  const approved = approvedStories(reviews ?? [], products);
  const [pick] = storyPhotos(approved, products, 1);
  if (!pick) return null;
  const { src, review, product } = pick;
  const cover = coverImage(product);
  return (
    <section
      aria-label={t("home.storiesEyebrow")}
      data-testid="review-interrupt"
      className="border-y border-line bg-ivory-100"
    >
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <Link
          href={`${productHref(product, shops)}#reviews`}
          className="group grid gap-5 rounded-md bg-paper p-4 ring-1 ring-line transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 sm:grid-cols-[minmax(0,220px)_1fr] sm:p-5"
        >
          <span className="relative block aspect-[4/5] overflow-hidden rounded-sm bg-ivory-200">
            <Image
              src={src}
              alt=""
              fill
              sizes="(min-width: 640px) 220px, 90vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              unoptimized={src.startsWith("data:")}
            />
            <span className="absolute left-2 top-2 rounded-full bg-paper/95 px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em] text-forest-800">
              {t("home.reviewPhotoTag")}
            </span>
          </span>
          <span className="flex min-w-0 flex-col justify-center">
            <span className="flex items-center gap-1 text-gold-600" aria-label={`${review.rating}/5`}>
              {Array.from({ length: 5 }, (_, i) => (
                <IconStar key={i} className={`h-4 w-4 ${i < review.rating ? "" : "opacity-25"}`} />
              ))}
            </span>
            <span className="mt-3 font-display text-xl leading-snug text-forest-900 sm:text-2xl">
              “{review.body.length > 180 ? `${review.body.slice(0, 177).trimEnd()}…` : review.body}”
            </span>
            <span className="mt-3 text-sm text-ink-soft">
              — {review.author}
              {review.verified ? ` · ${t("home.verifiedPurchase")}` : ""}
            </span>
            <span className="mt-4 flex items-center gap-3 border-t border-line pt-4">
              <span className="relative h-12 w-10 shrink-0 overflow-hidden rounded-sm bg-ivory-200">
                <Image src={cover.src} alt="" fill sizes="40px" className="object-cover" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-ink">{product.name}</span>
                <span className="block text-xs text-forest-700 underline-offset-4 group-hover:underline">
                  {t("home.reviewSeeProduct")}
                </span>
              </span>
            </span>
          </span>
        </Link>
      </div>
    </section>
  );
}
