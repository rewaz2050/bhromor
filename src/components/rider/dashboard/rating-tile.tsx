"use client";

/**
 * The rider's rating, big enough to read at a glance (2026-10-13).
 *
 * It was a 10px line under the "৭ দিনে" tile in the stats strip — the number
 * customers judge the rider on, printed smaller than the labels, while the
 * full card sat on /rider/profile. A rider should be able to see where they
 * stand without going looking, because it is the figure that decides whether
 * the next customer is happy before the parcel arrives.
 *
 * "…" until the figure lands, and a straight answer when there is not one
 * yet: never a fake 4.0, and never a blank where a new rider needs to know
 * they are still unrated.
 */

import Link from "next/link";

import type { RiderStatsView } from "@/lib/use-rider";

export default function RatingTile({ stats }: { stats: RiderStatsView | null }) {
  const hasRating = stats !== null && stats.ratingCount > 0;

  return (
    <section
      aria-label="রেটিং"
      data-testid="rating-tile"
      className="flex items-center gap-4 rounded-2xl border border-line bg-paper p-3.5"
    >
      <p className="font-display text-3xl font-bold text-forest-900">
        {stats === null ? "…" : hasRating ? stats.ratingAvg.toFixed(1) : "—"}
      </p>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
          কাস্টমার রেটিং
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          {stats === null
            ? "হিসাব হচ্ছে…"
            : hasRating
              ? `${stats.ratingCount} জন রেটিং দিয়েছেন`
              : "এখনো রেটিং পাননি — প্রথম ডেলিভারির পর আসবে"}
        </p>
      </div>
      <Link
        href="/rider/profile"
        className="shrink-0 text-xs font-semibold text-forest-800 underline-offset-2 hover:underline"
      >
        বিস্তারিত
      </Link>
    </section>
  );
}
