"use client";

import { useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Order } from "@/lib/orders";
import {
  MAX_COMMENT,
  NEGATIVE_TAGS,
  POSITIVE_TAGS,
  tagLabel,
  type FeedbackTag,
} from "@/lib/delivery-feedback";

/**
 * Post-delivery rider rating on the track page (202609250008): once the
 * order is delivered and a rider carried it, the shopper can rate the
 * delivery 1–5 stars — phone-verified server-side, one rating per order
 * (a re-tap answers "already", never a skewed average). The rating rolls
 * into the rider's own dashboard scoreboard.
 */

/** Optional second step: WHY — quick reasons + words. Skippable; can be sent once. */
function FeedbackStep({ order, phone, stars }: { order: Order; phone: string; stars: number }) {
  const { lang } = useLanguage();
  const bn = lang === "bn";
  const [tags, setTags] = useState<FeedbackTag[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = stars <= 3 ? NEGATIVE_TAGS : POSITIVE_TAGS;

  if (skipped) return null;
  if (sent) {
    return (
      <p role="status" data-testid="feedback-thanks" className="mt-2 text-xs font-medium text-forest-900">
        {bn ? "আপনার মতামতের জন্য ধন্যবাদ — আমরা দেখব।" : "Thanks for telling us — we will look into it."}
      </p>
    );
  }

  const toggle = (t: FeedbackTag) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const send = async () => {
    if (busy || (tags.length === 0 && comment.trim() === "")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/track/rate/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: order.id, phone, tags, comment }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? "পাঠানো যায়নি।");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "পাঠানো যায়নি।");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="feedback-step" className="mt-3 border-t border-line pt-3">
      <p className="text-sm font-medium text-forest-900">
        {stars <= 2
          ? bn ? "দুঃখিত! কী সমস্যা হয়েছিল?" : "Sorry about that — what went wrong?"
          : bn ? "কিছু বলতে চান? (ঐচ্ছিক)" : "Anything to add? (optional)"}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {choices.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tags.includes(t)}
            onClick={() => toggle(t)}
            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${
              tags.includes(t) ? "bg-forest-800 text-white ring-forest-800" : "bg-white text-forest-900 ring-line"
            }`}
          >
            {tagLabel(t, bn ? "bn" : "en")}
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        maxLength={MAX_COMMENT}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        aria-label={bn ? "আপনার কথা" : "Your words"}
        placeholder={bn ? "সংক্ষেপে লিখুন…" : "A few words…"}
        className="mt-2 w-full rounded-xl border border-line bg-white px-3 py-2 text-sm"
      />
      {error && <p role="alert" className="mt-1.5 text-xs font-medium text-rose-700">{error}</p>}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={() => void send()}
          disabled={busy || (tags.length === 0 && comment.trim() === "")}
          className="rounded-xl bg-forest-800 px-4 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {busy ? (bn ? "পাঠানো হচ্ছে…" : "Sending…") : bn ? "মতামত পাঠান" : "Send feedback"}
        </button>
        <button type="button" onClick={() => setSkipped(true)} className="text-xs text-ink-soft underline">
          {bn ? "এড়িয়ে যান" : "Skip"}
        </button>
      </div>
    </div>
  );
}

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
      ) : null}
      {done ? <FeedbackStep order={order} phone={phone} stars={stars} /> : (
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
