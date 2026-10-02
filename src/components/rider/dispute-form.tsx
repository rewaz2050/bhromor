"use client";

/** Item W — "something is wrong with this trip's money": category, words, optional amount. */

import { useState } from "react";
import { DISPUTE_CATEGORIES, DISPUTE_MESSAGE } from "@/lib/rider-disputes";

export function DisputeForm({
  orderNo,
  onSubmit,
  onCancel,
}: {
  orderNo: string;
  /** null = sent; otherwise the message to show. */
  onSubmit: (form: { category: string; message: string; claimedTaka?: string }) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [category, setCategory] = useState<string>(DISPUTE_CATEGORIES[0].id);
  const [message, setMessage] = useState("");
  const [claimed, setClaimed] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const err = await onSubmit({ category, message, claimedTaka: claimed.trim() === "" ? undefined : claimed });
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <form onSubmit={submit} data-testid="dispute-form" aria-label={`#${orderNo} নিয়ে অভিযোগ`} className="mt-3 space-y-2 rounded-xl bg-ivory-100 p-3 ring-1 ring-line">
      <label className="block text-[11px] font-semibold text-ink-soft">
        সমস্যার ধরন
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="mt-1 w-full rounded-lg bg-paper px-2.5 py-2 text-xs text-ink ring-1 ring-line"
        >
          {DISPUTE_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.bn}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-[11px] font-semibold text-ink-soft">
        কী হয়েছে?
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={DISPUTE_MESSAGE.max}
          rows={3}
          className="mt-1 w-full rounded-lg bg-paper px-2.5 py-2 text-xs text-ink ring-1 ring-line"
          placeholder="যেমন: ফি ওয়ালেটে আসেনি / কাস্টমার ৳৫০ কম দিয়েছেন"
        />
      </label>
      <label className="block text-[11px] font-semibold text-ink-soft">
        কত টাকার হিসাব? (ঐচ্ছিক)
        <input
          inputMode="decimal"
          value={claimed}
          onChange={(e) => setClaimed(e.target.value)}
          className="mt-1 w-full rounded-lg bg-paper px-2.5 py-2 text-xs text-ink ring-1 ring-line"
          placeholder="৳"
        />
      </label>
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-2.5 py-2 text-[11px] font-semibold text-rose-900 ring-1 ring-rose-200">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || message.trim().length < DISPUTE_MESSAGE.min}
          className="rounded-full bg-forest-900 px-4 py-2 text-xs font-semibold text-ivory-50 disabled:opacity-40"
        >
          {busy ? "পাঠানো হচ্ছে…" : "অভিযোগ পাঠান"}
        </button>
        <button type="button" onClick={onCancel} className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line">
          বাতিল
        </button>
      </div>
    </form>
  );
}
