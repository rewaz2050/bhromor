"use client";

/**
 * C2 (2026-09-28) — the bag, shown as the parcels it will actually become.
 *
 * A bag with two shops' items does not become one bigger order; it becomes
 * two orders, two parcels and two deliveries. Saying so is the whole point of
 * this card: a buyer who discovers the second delivery charge on the doorstep
 * feels cheated, and a buyer who sees it here just decides.
 *
 * Presentational: the checkout computes the money, this only shows it.
 */

import { formatBdt } from "@/lib/format";
import { bnDigits } from "@/lib/arrival";

export interface ShopParcel {
  shopId: string;
  shopName: string;
  /** Units in this parcel. */
  qty: number;
  subtotal: number;
  /** Paisa charged to bring THIS parcel (0 when it is free). */
  delivery: number;
  freeDelivery: boolean;
  /** Who paid for the free ride, when it is free. */
  freeBy?: "coupon" | "plus" | "shop" | "platform" | null;
  /** Coupon money off this parcel. */
  discount: number;
  /** The automatic offer this parcel earned on its own. */
  promo: number;
  total: number;
  /** Why this shop cannot take the order right now (closed, on holiday…). */
  closed?: string | null;
  /** The parcel carrying the tip and the gift wrap, when the basket has any. */
  carries?: "tip" | "gift" | "both" | null;
}

const freeLabel = (by: ShopParcel["freeBy"]): string => {
  if (by === "shop") return "ফ্রি ডেলিভারি (দোকানের অফার)";
  if (by === "platform") return "ফ্রি ডেলিভারি (PROSANTI অফার)";
  if (by === "coupon") return "ফ্রি ডেলিভারি (কুপন)";
  if (by === "plus") return "PROSANTI+ — ডেলিভারি ফ্রি";
  return "ফ্রি ডেলিভারি";
};

export default function ShopSplitCard({
  parcels,
  courier = false,
}: {
  parcels: ShopParcel[];
  /** Outside Sadar each parcel rides the courier, which is worth naming. */
  courier?: boolean;
}) {
  if (parcels.length < 2) return null;
  return (
    <section
      aria-label="Orders by shop"
      className="rounded-2xl bg-paper p-5 ring-1 ring-line"
      data-testid="shop-split"
    >
      <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
        {bnDigits(String(parcels.length))}টি দোকান · {bnDigits(String(parcels.length))}টি
        অর্ডার
      </h3>
      <p className="mt-1 text-[0.68rem] leading-5 text-ink-soft">
        প্রতিটি দোকান নিজের পার্সেল প্যাক করে আলাদাভাবে পাঠায় — তাই অর্ডার ও ডেলিভারি চার্জও
        আলাদা। একবার চাপলেই সব অর্ডার একসাথে হবে।
        {courier && " সদরের বাইরে প্রতিটি পার্সেল কুরিয়ারে যায়।"}
      </p>

      <ul className="mt-4 divide-y divide-line">
        {parcels.map((parcel) => (
          <li
            key={parcel.shopId}
            data-testid={`parcel-${parcel.shopId}`}
            className="flex flex-wrap items-start justify-between gap-2 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{parcel.shopName}</p>
              <p className="text-xs text-ink-soft">
                {bnDigits(String(parcel.qty))}টি পণ্য · {formatBdt(parcel.subtotal)}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {parcel.freeDelivery
                  ? freeLabel(parcel.freeBy)
                  : `ডেলিভারি ${formatBdt(parcel.delivery)}`}
                {parcel.discount > 0 && ` · কুপন −${formatBdt(parcel.discount)}`}
                {parcel.promo > 0 && ` · অফার −${formatBdt(parcel.promo)}`}
              </p>
              {parcel.carries && (
                <p className="mt-0.5 text-[0.68rem] text-forest-800">
                  {parcel.carries === "gift"
                    ? "গিফট র‍্যাপ এই পার্সেলে"
                    : parcel.carries === "tip"
                      ? "টিপ এই পার্সেলের রাইডারকে"
                      : "টিপ ও গিফট র‍্যাপ এই পার্সেলে"}
                </p>
              )}
              {parcel.closed && (
                <p className="mt-1 text-xs font-medium text-amber-800" data-testid={`parcel-closed-${parcel.shopId}`}>
                  {parcel.closed}
                </p>
              )}
            </div>
            <p
              data-testid={`parcel-total-${parcel.shopId}`}
              className="font-display text-lg text-forest-900"
            >
              {formatBdt(parcel.total)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
