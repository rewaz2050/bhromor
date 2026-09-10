"use client";

import { usePromo } from "@/lib/use-promo";
import { IconGift } from "@/components/ui/icons";

export default function DeliveryPromoLive() {
  const promo = usePromo();

  if (promo.loading) {
    return (
      <div className="mt-8 rounded-2xl bg-gold-50 p-5 ring-1 ring-gold-200 animate-pulse">
        <div className="h-4 w-48 bg-gold-200 rounded" />
        <div className="mt-2 h-3 w-full bg-gold-100 rounded" />
      </div>
    );
  }

  const pct = Math.min(100, Math.max(0, (promo.totalOrders / promo.limit) * 100));

  return (
    <div className="mt-8 rounded-2xl bg-gradient-to-r from-gold-50 to-amber-50 p-5 ring-1 ring-gold-200">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-forest-800 text-gold-300">
          <IconGift className="h-5 w-5" />
        </span>
        <div className="flex-1 min-w-0">
          {promo.promoActive ? (
            <>
              <p className="text-sm font-bold text-forest-900">
                🎉 প্রথম {promo.limit} অর্ডারে ডেলিভারি ফ্রি! {promo.remainingFree} টা বাকি
              </p>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-forest-100 ring-1 ring-line">
                <div
                  className="h-2.5 rounded-full bg-gradient-to-r from-forest-700 to-forest-900 transition-all duration-700"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[11px] text-ink-soft">
                <span>{promo.totalOrders} claimed</span>
                <span>{promo.remainingFree} left — order now & get FREE!</span>
                <span>{promo.limit} total</span>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-bold text-forest-900">
                🎉 প্রথম {promo.limit} ফ্রি শেষ — এখন ৳1000+ অর্ডারে সবসময় ফ্রি!
              </p>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-forest-100 ring-1 ring-line">
                <div className="h-2.5 w-full rounded-full bg-forest-800" />
              </div>
              <p className="mt-2 text-[11px] text-ink-soft">
                {promo.totalOrders} orders completed — thank you Sunamganj! ৳1000+ free delivery continues.
              </p>
            </>
          )}
          <p className="mt-3 text-xs leading-5 text-ink-soft">
            Zone A (Traffic Point 0-1.5km) ৳30, Zone B (Sadar Core) ৳50, Zone C (Extended) ৳70, Zone D (Bahire) ৳100 · ৳1000+ always free · Minimum ৳500 for Zone D outside.
          </p>
        </div>
      </div>
    </div>
  );
}
