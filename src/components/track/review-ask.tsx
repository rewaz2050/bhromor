"use client";

import { useProductHref } from "@/lib/use-product-href";
import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconSparkles } from "@/components/ui/icons";
import type { Order } from "@/lib/orders";
import { saveReviewProof } from "@/lib/review-proof";
import { usePublicSettings } from "@/lib/use-public-settings";

/**
 * Post-delivery review ask on the track page (only once the order really is
 * delivered). Links straight to the review form of each bought piece — the
 * public form is moderated, so the ask stays honest: write it yourself.
 */

const MAX_ASKS = 3;

export default function ReviewAsk({ order }: { order: Order }) {
  const { lang } = useLanguage();
  const { settings } = usePublicSettings();
  // Before the early returns — hooks are unconditional (C5 product links).
  const hrefFor = useProductHref();
  if (order.status !== "delivered") return null;
  const askable = order.items
    .filter((item) => item.slug)
    .slice(0, MAX_ASKS);
  if (askable.length === 0) return null;

  return (
    <div
      data-testid="review-ask"
      className="mt-5 flex items-start gap-3 rounded-2xl bg-gold-50/70 px-4 py-3 ring-1 ring-gold-200"
    >
      <IconSparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-forest-900">
          {lang === "bn"
            ? "ছবিসহ রিভিউ দিন — কেমন লাগল?"
            : "Add a photo review — how was it?"}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-ink-soft">
          {lang === "bn"
            ? "গায়ে-দেওয়া একটা ছবি আর এক লাইন — পরের ক্রেতা ঠিক মাপটা বাছতে পারবেন। ছবির রিভিউ পণ্যের পাতায় সবার আগে দেখায়।"
            : "One photo of it worn and one line — the next shopper picks the right size. Photo reviews show first on the product page."}
        </p>
        {settings.loyaltyEnabled ? (
          <p className="mt-1 text-xs font-medium text-forest-800" data-testid="review-ask-stamp">
            {lang === "bn"
              ? "রিভিউ অনুমোদন হলে স্মার্ট কার্ডে ১টা স্ট্যাম্প যোগ হবে।"
              : "Once approved, the review adds 1 stamp to your Smart Card."}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {askable.map((item) => (
            <Link
              key={`${item.productId}-${item.slug}`}
              href={`${hrefFor({ slug: item.slug })}#reviews-heading`}
              data-testid="review-ask-link"
              onClick={() =>
                // The form on the product page proves the purchase with this
                // (UX plan §4/§7, R10) → verified badge + a stamp on approval.
                saveReviewProof({
                  orderId: order.id,
                  phone: order.customer.phone,
                  productIds: order.items.map((i) => i.productId),
                })
              }
              className="inline-flex max-w-full items-center rounded-full bg-paper px-3 py-1.5 text-xs font-medium text-forest-800 ring-1 ring-line hover:bg-ivory-100"
            >
              <span className="shrink-0">
                {lang === "bn" ? "রিভিউ দিন" : "Review"}
              </span>
              <span className="ml-1.5 min-w-0 truncate text-ink-soft">
                {item.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
