"use client";

import { useState } from "react";
import { field, label } from "@/components/admin/form-ui";
import { IconCheck, IconShield } from "@/components/ui/icons";

export function ExchangeForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("Size Exchange (সাইজ পরিবর্তন)");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanPhone = phone.trim().replace(/[\s-]/g, "");
    const cleanOrderId = orderId.trim().toUpperCase();
    const fullMessage = `[Exchange Request: ${reason}] Order ID: ${cleanOrderId} — ${details.trim()}`;

    if (cleanName.length < 2) {
      setError("আপনার নাম লিখুন।");
      return;
    }
    if (!/^(\+?88)?01[0-9]{9}$/.test(cleanPhone)) {
      setError("সঠিক ১১-সংখ্যার মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।");
      return;
    }
    if (cleanOrderId.length < 5) {
      setError("সঠিক অর্ডার নম্বর লিখুন।");
      return;
    }
    if (details.trim().length < 5) {
      setError("কোন প্রডাক্টের কোন সাইজ পরিবর্তন করতে চান তা বিস্তারিত লিখুন।");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          phone: cleanPhone,
          topic: "Return / exchange",
          message: fullMessage,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error ?? "অনুরোধ পাঠানো যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।");
      }

      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "অনুরোধ পাঠানো যায়নি।");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-6 sm:p-8 text-center text-emerald-950">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-700 text-white shadow-sm">
          <IconCheck className="h-7 w-7 stroke-[2.5]" />
        </span>
        <h3 className="font-display mt-4 text-xl font-bold">
          এক্সচেঞ্জ রিকোয়েস্ট গৃহীত হয়েছে!
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-emerald-900/80 sm:text-sm max-w-md mx-auto">
          ধন্যবাদ <strong>{name}</strong>! আপনার অর্ডার <strong>#{orderId}</strong> এর সাইজ পরিবর্তনের অনুরোধ জমা হয়েছে। আমাদের কাস্টমার সাপোর্ট টিম খুব দ্রুত আপনাকে কল করে এক্সচেঞ্জ রাইডার পাঠাবে।
        </p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setOrderId("");
            setDetails("");
          }}
          className="mt-6 rounded-full bg-emerald-800 px-6 py-2 text-xs font-semibold text-white hover:bg-emerald-900"
        >
          আরেকটি অনুরোধ করুন
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-line bg-paper p-6 sm:p-8 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-forest-800 text-gold-300">
          <IconShield className="h-5 w-5" />
        </span>
        <div>
          <h3 className="font-display text-lg font-bold text-forest-900">
            ইনস্ট্যান্ট সাইজ এক্সচেঞ্জ ফর্ম (Quick Exchange Form)
          </h3>
          <p className="text-xs text-ink-soft">
            ডেলিভারি পাওয়ার ৭ দিনের মধ্যে যেকোনো সাইজ পরিবর্তনের জন্য নিচে ফর্মটি পূরণ করুন
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && (
          <div role="alert" className="rounded-2xl bg-rose-50 p-3.5 text-xs font-semibold text-rose-800 ring-1 ring-rose-200">
            {error}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>আপনার নাম *</span>
            <input
              required
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="আপনার পুরো নাম"
            />
          </label>

          <label className="block">
            <span className={label}>মোবাইল নম্বর *</span>
            <input
              required
              type="tel"
              className={field}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="017XXXXXXXX"
            />
          </label>

          <label className="block">
            <span className={label}>অর্ডার আইডি (Order ID) *</span>
            <input
              required
              className={field}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="PS-YYYYMMDD-XXXX"
            />
          </label>

          <label className="block">
            <span className={label}>অনুরোধের ধরন (Reason) *</span>
            <select
              className={field}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              <option value="Size Exchange (সাইজ পরিবর্তন)">সাইজ পরিবর্তন (Size Exchange)</option>
              <option value="Color Swap (রঙ পরিবর্তন)">রঙ পরিবর্তন (Color Swap)</option>
              <option value="Defective / Damaged (ত্রুটিপূর্ণ পণ্য)">ত্রুটিপূর্ণ পণ্য (Damaged item)</option>
              <option value="Other Return (অন্যান্য ফেরত)">অন্যান্য (Other)</option>
            </select>
          </label>
        </div>

        <label className="block">
          <span className={label}>প্রয়োজনীয় সাইজ ও বিবরণ *</span>
          <textarea
            required
            rows={3}
            className={field}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="যেমন: আমি পাঞ্জাবিটি পেয়েছি কিন্তু সাইজ L একটু বড় হচ্ছে, এর বদলে সাইজ M পাঠালে উপকৃত হব।"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-12 rounded-full bg-forest-800 font-semibold text-xs text-ivory-50 transition-colors hover:bg-forest-900 disabled:opacity-60"
        >
          {submitting ? "পাঠানো হচ্ছে…" : "এক্সচেঞ্জ অনুরোধ জমা দিন (Submit Request)"}
        </button>
      </form>
    </div>
  );
}
