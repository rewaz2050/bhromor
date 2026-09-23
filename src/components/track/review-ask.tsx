"use client";

import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconSparkles } from "@/components/ui/icons";
import type { Order } from "@/lib/orders";

/**
 * Post-delivery review ask on the track page (only once the order really is
 * delivered). Links straight to the review form of each bought piece — the
 * public form is moderated, so the ask stays honest: write it yourself.
 */

const MAX_ASKS = 3;

export default function ReviewAsk({ order }: { order: Order }) {
  const { lang } = useLanguage();
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
            ? "অর্ডারটি কেমন লাগল?"
            : "How was the order?"}
        </p>
        <p className="mt-0.5 text-xs leading-5 text-ink-soft">
          {lang === "bn"
            ? "এক লাইনের একটা রিভিউ পরের ক্রেতাকে ঠিক কাপড়টা বাছতে সাহায্য করে।"
            : "A one-line review helps the next shopper pick the right piece."}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {askable.map((item) => (
            <Link
              key={`${item.productId}-${item.slug}`}
              href={`/product/${item.slug}#reviews-heading`}
              data-testid="review-ask-link"
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
