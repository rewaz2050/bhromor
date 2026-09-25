"use client";

import { useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Order } from "@/lib/orders";

/**
 * Post-delivery rider rating on the track page (202609250008): once the
 * order is delivered and a rider carried it, the shopper can rate the
 * delivery 1–5 stars — phone-verified server-side, one rating per order
 * (a re-tap answers "already", never a skewed average). The rating rolls
 * into the rider's own dashboard scoreboard.
 */

export default function RiderRatingAsk({
  order,
  phone,
}: {
  order: Order;
  phone: string;
}) {
  const { lang } = useLanguage();
  const [stars, setStars] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (order.status !== "delivered" || !order.rider) return null;

  const rate = async (value: number) => {
    if (busy || done) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/track/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, phone, stars: value }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!res.ok) throw new Error(data?.error ?? "রেটিং দেওয়া যায়নি।");
      setStars(value);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "রেটিং দেওয়া যায়নি।");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="rider-rating-ask"
      className="mt-5 rounded-2xl bg-ivory-100/70 px-4 py-3 ring-1 ring-line"
    >
      {done ? (
        <p role="status" className="text-sm font-medium text-forest-900">
          {lang === "bn"
            ? `ধন্যবাদ! ${order.rider.name}-এর জন্য আপনার রেটিং রেকর্ড হয়েছে ⭐`
            : `Thank you! Your rating for ${order.rider.name} is recorded ⭐`}
        </p>
      ) : (
        <>
          <p className="text-sm font-medium text-forest-900">
            {lang === "bn"
              ? `${order.rider.name}-এর ডেলিভারি কেমন হয়েছিল?`
              : `How was ${order.rider.name}'s delivery?`}
          </p>
          <p className="mt-0.5 text-xs leading-5 text-ink-soft">
            {lang === "bn"
              ? "আপনার রেটিং রাইডারের রেকর্ডে যোগ হবে — ভালো কাজের স্বীকৃতি।"
              : "Your rating goes on the rider's own record — recognition for good work."}
          </p>
          <div className="mt-2 flex items-center gap-1" role="group" aria-label={lang === "bn" ? "রেটিং দিন" : "Rate the delivery"}>
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                disabled={busy}
                aria-label={lang === "bn" ? `${value} স্টার` : `${value} star${value > 1 ? "s" : ""}`}
                onClick={() => void rate(value)}
                className={`rounded-full px-1 text-2xl leading-none transition-transform hover:scale-110 disabled:opacity-50 ${
                  value <= stars ? "text-gold-500" : "text-line-strong"
                }`}
              >
                ★
              </button>
            ))}
            {busy && (
              <span className="ml-2 text-xs text-ink-soft">
                {lang === "bn" ? "পাঠানো হচ্ছে…" : "Sending…"}
              </span>
            )}
          </div>
          {error && (
            <p role="alert" className="mt-1.5 text-xs font-medium text-rose-700">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
