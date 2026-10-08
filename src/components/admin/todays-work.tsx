"use client";

/**
 * "Today's work" — one list, every queue that needs a human, each row a door
 * to that queue (ops pass 2026-10-06). See `lib/admin-todays-work.ts` for
 * the ordering rules; this file is only presentation.
 *
 * Counts come in as props because the dashboard has already loaded orders,
 * applications and the catalog — no second fetch for numbers it holds. The
 * one thing it fetches for itself is the review moderation count.
 */

import Link from "next/link";
import {
  buildTodaysWork,
  type TodaysWorkInput,
} from "@/lib/admin-todays-work";
import { statusCounts } from "@/lib/review-store";
import { useReviews } from "@/lib/use-reviews";
import { IconArrowRight, IconCheck } from "@/components/ui/icons";

export type TodaysWorkProps = Omit<TodaysWorkInput, "reviewsPending">;

export default function TodaysWork(props: TodaysWorkProps) {
  const { reviews } = useReviews();
  const counts = statusCounts(reviews);
  // Pending = never seen; flagged = a shopper reported it. Both need a person.
  const items = buildTodaysWork({
    ...props,
    reviewsPending: counts.pending + counts.flagged,
  });

  return (
    <section
      aria-label="Today's work"
      className="rounded-2xl bg-paper p-5 ring-1 ring-line sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-medium text-forest-900">
          Today&apos;s work
        </h2>
        <p className="text-xs text-ink-soft">
          {items.length === 0
            ? "every queue is clear"
            : `${items.reduce((sum, item) => sum + item.count, 0)} thing${items.reduce((sum, item) => sum + item.count, 0) === 1 ? "" : "s"} waiting on a person`}
        </p>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-ink-soft">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
            <IconCheck className="h-3.5 w-3.5" />
          </span>
          Nothing is waiting — orders are moving, stock is healthy, no approvals
          pending.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={item.href}
                className="group flex items-center gap-3 py-3 transition-colors"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                    item.urgent
                      ? "bg-rose-100 text-rose-700"
                      : item.tone === "money"
                        ? "bg-amber-100 text-amber-900"
                        : "bg-forest-50 text-forest-800"
                  }`}
                >
                  {item.count > 99 ? "99+" : item.count}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    {item.label}
                  </span>
                  <span
                    className={`block text-xs ${
                      item.urgent ? "font-semibold text-rose-700" : "text-ink-soft"
                    }`}
                  >
                    {item.detail}
                  </span>
                </span>
                {item.urgent && (
                  <span className="hidden rounded-full bg-rose-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-rose-700 sm:block">
                    late
                  </span>
                )}
                <IconArrowRight className="h-4 w-4 shrink-0 text-ink-soft transition-colors group-hover:text-forest-800" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
