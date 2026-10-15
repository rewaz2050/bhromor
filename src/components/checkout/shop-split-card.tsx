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
 * Copy follows the storefront language.
 */

import { formatBdt } from "@/lib/format";
import { bnDigits } from "@/lib/arrival";
import { useLanguage } from "@/components/i18n/language-provider";

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

const COPY = {
  bn: {
    shops: (n: string) => `${n}টি দোকান`,
    orders: (n: string) => `${n}টি অর্ডার`,
    intro: "প্রতিটি দোকান নিজের পার্সেল প্যাক করে আলাদাভাবে পাঠায় — তাই অর্ডার ও ডেলিভারি চার্জও আলাদা। একবার চাপলেই সব অর্ডার একসাথে হবে।",
    courier: " সদরের বাইরে প্রতিটি পার্সেল কুরিয়ারে যায়।",
    items: (n: string, price: string) => `${n}টি পণ্য · ${price}`,
    delivery: (price: string) => `ডেলিভারি ${price}`,
    coupon: (price: string) => ` · কুপন −${price}`,
    offer: (price: string) => ` · অফার −${price}`,
    gift: "গিফট র‍্যাপ এই পার্সেলে",
    tip: "টিপ এই পার্সেলের রাইডারকে",
    both: "টিপ ও গিফট র‍্যাপ এই পার্সেলে",
    freeShop: "ফ্রি ডেলিভারি (দোকানের অফার)",
    freePlatform: "ফ্রি ডেলিভারি (PROSANTI অফার)",
    freeCoupon: "ফ্রি ডেলিভারি (কুপন)",
    freePlus: "PROSANTI+ — ডেলিভারি ফ্রি",
    freeDefault: "ফ্রি ডেলিভারি",
    aria: "Orders by shop",
  },
  en: {
    shops: (n: string) => `${n} shops`,
    orders: (n: string) => `${n} orders`,
    intro: "Each shop packs and ships its own parcel, so the orders and delivery charges are separate. One tap places them all together.",
    courier: " Outside Sadar, each parcel goes by courier.",
    items: (n: string, price: string) => `${n} item${n === "1" ? "" : "s"} · ${price}`,
    delivery: (price: string) => `Delivery ${price}`,
    coupon: (price: string) => ` · Coupon −${price}`,
    offer: (price: string) => ` · Offer −${price}`,
    gift: "Gift wrap on this parcel",
    tip: "Tip for this parcel's rider",
    both: "Tip and gift wrap on this parcel",
    freeShop: "Free delivery (shop offer)",
    freePlatform: "Free delivery (PROSANTI offer)",
    freeCoupon: "Free delivery (coupon)",
    freePlus: "PROSANTI+ — free delivery",
    freeDefault: "Free delivery",
    aria: "Orders by shop",
  },
} as const;

export default function ShopSplitCard({
  parcels,
  courier = false,
}: {
  parcels: ShopParcel[];
  /** Outside Sadar each parcel rides the courier, which is worth naming. */
  courier?: boolean;
}) {
  const { lang } = useLanguage();
  const c = COPY[lang === "bn" ? "bn" : "en"];
  const bn = lang === "bn";
  const num = (n: number) => (bn ? bnDigits(String(n)) : String(n));

  const freeLabel = (by: ShopParcel["freeBy"]): string => {
    if (by === "shop") return c.freeShop;
    if (by === "platform") return c.freePlatform;
    if (by === "coupon") return c.freeCoupon;
    if (by === "plus") return c.freePlus;
    return c.freeDefault;
  };

  if (parcels.length < 2) return null;
  return (
    <section
      aria-label={c.aria}
      className="rounded-2xl bg-paper p-5 ring-1 ring-line"
      data-testid="shop-split"
    >
      <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
        {c.shops(num(parcels.length))} · {c.orders(num(parcels.length))}
      </h3>
      <p className="mt-1 text-[0.68rem] leading-5 text-ink-soft">
        {c.intro}
        {courier && c.courier}
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
                {c.items(num(parcel.qty), formatBdt(parcel.subtotal))}
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {parcel.freeDelivery
                  ? freeLabel(parcel.freeBy)
                  : c.delivery(formatBdt(parcel.delivery))}
                {parcel.discount > 0 && c.coupon(formatBdt(parcel.discount))}
                {parcel.promo > 0 && c.offer(formatBdt(parcel.promo))}
              </p>
              {parcel.carries && (
                <p className="mt-0.5 text-[0.68rem] text-forest-800">
                  {parcel.carries === "gift"
                    ? c.gift
                    : parcel.carries === "tip"
                      ? c.tip
                      : c.both}
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
