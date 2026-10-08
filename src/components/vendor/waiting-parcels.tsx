"use client";

/**
 * "Rider-এর অপেক্ষায়" — the shelf, not the count (vendor + rider pass,
 * 2026-10-07).
 *
 * The dashboard already said "Ready for rider: 3". What the counter needs is
 * the parcel: how long it has been sitting there, and the rider's name the
 * moment somebody accepts it. Nothing renders when the shelf is empty — an
 * empty "all clear" box is noise on a counter phone.
 *
 * The copy escalates but never guesses: with no rider there is no ETA to
 * invent, so it says how long the wait has been and stops there.
 */

import Link from "next/link";
import { parcelQueue } from "@/lib/pickup-wait";
import type { Order } from "@/lib/orders";

const TONE_ROW = {
  calm: "ring-line",
  warn: "ring-amber-300 bg-amber-50",
  urgent: "ring-rose-300 bg-rose-50",
} as const;

const TONE_TEXT = {
  calm: "text-ink-soft",
  warn: "text-amber-900",
  urgent: "text-rose-800",
} as const;

export default function WaitingParcels({
  orders,
  now,
}: {
  orders: readonly Order[];
  /** Epoch ms — the page's own clock, so tests can hold it still. */
  now: number;
}) {
  const queue = parcelQueue(orders, now);
  if (queue.length === 0) return null;

  return (
    <section
      aria-label="Waiting for pickup"
      data-testid="waiting-parcels"
      className="mt-6 rounded-2xl bg-paper p-5 ring-1 ring-line"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Rider-এর অপেক্ষায়
        </h3>
        <p className="text-xs text-ink-soft">
          {queue.length}টি পার্সেল তৈরি হয়ে বসে আছে
        </p>
      </div>
      <ul className="mt-3 space-y-2">
        {queue.map((wait) => (
          <li
            key={wait.orderId}
            data-testid={`waiting-parcel-${wait.orderId}`}
            className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-3.5 py-2.5 ring-1 ${TONE_ROW[wait.tone]}`}
          >
            <Link
              href={`/vendor/orders/${encodeURIComponent(wait.orderId)}`}
              className="font-mono text-xs font-bold text-forest-900 underline underline-offset-2"
            >
              {wait.orderId}
            </Link>
            <span className="truncate text-xs text-ink-soft">{wait.area}</span>
            <p className={`min-w-0 flex-1 text-xs font-semibold ${TONE_TEXT[wait.tone]}`}>
              {wait.label}
            </p>
            {wait.rider?.phone ? (
              <a
                href={`tel:${wait.rider.phone}`}
                aria-label={`Call rider ${wait.rider.name}`}
                data-testid="waiting-parcel-call"
                className="min-h-11 inline-flex items-center rounded-full bg-forest-800 px-3.5 text-[11px] font-semibold text-ivory-50 hover:bg-forest-700"
              >
                কল করুন
              </a>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[0.68rem] text-ink-soft">
        রাইডার পাওয়া না গেলে পার্সেল যতক্ষণ বসে থাকে কাস্টমার ততক্ষণ অপেক্ষায় —
        অনেক্ষণ হলে অ্যাডমিনকে জানান।
      </p>
    </section>
  );
}
