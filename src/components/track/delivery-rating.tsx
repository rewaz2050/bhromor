"use client";

import { useState } from "react";

export function DeliveryRating({ orderId }: { orderId: string }) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (rating === 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId,
          rating,
          body: comment || `Delivery rating ${rating}★ for order ${orderId} — Sunamganj Sadar`,
          author: "Customer",
        }),
      });
      if (res.ok) setSubmitted(true);
    } catch {}
    setLoading(false);
  };

  if (submitted) {
    return (
      <div className="rounded-2xl bg-emerald-50 p-4 ring-1 ring-emerald-200 text-sm text-emerald-900">
        ✅ Thank you! Your {rating}★ rating saved — helps riders & PROSANTI.
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-paper p-5 ring-1 ring-line space-y-3">
      <h4 className="text-sm font-semibold">⭐ Rate your delivery — Sunamganj Sadar (free)</h4>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setRating(s)}
            className={`h-9 w-9 rounded-full text-lg ${rating >= s ? "bg-gold-500 text-white" : "bg-ivory-100 text-ink-soft"}`}
          >
            ★
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="How was rider, timing, Traffic Point pickup?"
        className="w-full rounded-xl bg-ivory-50 px-3 py-2 text-sm ring-1 ring-line"
        rows={2}
      />
      <button
        type="button"
        disabled={rating === 0 || loading}
        onClick={submit}
        className="rounded-full bg-forest-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {loading ? "Submitting..." : `Submit ${rating ? `${rating}★` : ""} Rating`}
      </button>
    </div>
  );
}
