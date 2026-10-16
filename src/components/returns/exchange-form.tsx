"use client";

import { useState } from "react";
import { field, label } from "@/components/admin/form-ui";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconCheck, IconShield } from "@/components/ui/icons";

/* The option `value`s are what the request text carries to the support team,
   so they stay Bangla in both languages; only the visible labels change. */
const REASONS = [
  { value: "Size Exchange (সাইজ পরিবর্তন)", bn: "সাইজ পরিবর্তন (Size Exchange)", en: "Size exchange" },
  { value: "Color Swap (রঙ পরিবর্তন)", bn: "রঙ পরিবর্তন (Color Swap)", en: "Colour swap" },
  { value: "Defective / Damaged (ত্রুটিপূর্ণ পণ্য)", bn: "ত্রুটিপূর্ণ পণ্য (Damaged item)", en: "Defective / damaged item" },
  { value: "Other Return (অন্যান্য ফেরত)", bn: "অন্যান্য (Other)", en: "Other" },
] as const;

const COPY = {
  bn: {
    nameErr: "আপনার নাম লিখুন।",
    phoneErr: "সঠিক ১১-সংখ্যার মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।",
    orderErr: "সঠিক অর্ডার নম্বর লিখুন।",
    detailsErr: "কোন প্রডাক্টের কোন সাইজ পরিবর্তন করতে চান তা বিস্তারিত লিখুন।",
    sendFail: "অনুরোধ পাঠানো যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন।",
    sendFailShort: "অনুরোধ পাঠানো যায়নি।",
    doneTitle: "এক্সচেঞ্জ রিকোয়েস্ট গৃহীত হয়েছে!",
    thanks: "ধন্যবাদ",
    doneBody1: "! আপনার অর্ডার",
    doneBody2: "এর সাইজ পরিবর্তনের অনুরোধ জমা হয়েছে। আমাদের কাস্টমার সাপোর্ট টিম খুব দ্রুত আপনাকে কল করে এক্সচেঞ্জ রাইডার পাঠাবে।",
    again: "আরেকটি অনুরোধ করুন",
    formTitle: "ইনস্ট্যান্ট সাইজ এক্সচেঞ্জ ফর্ম (Quick Exchange Form)",
    formSub: "ডেলিভারি পাওয়ার ৭ দিনের মধ্যে যেকোনো সাইজ পরিবর্তনের জন্য নিচে ফর্মটি পূরণ করুন",
    name: "আপনার নাম *",
    namePh: "আপনার পুরো নাম",
    phone: "মোবাইল নম্বর *",
    order: "অর্ডার আইডি (Order ID) *",
    reason: "অনুরোধের ধরন (Reason) *",
    details: "প্রয়োজনীয় সাইজ ও বিবরণ *",
    detailsPh: "যেমন: আমি পাঞ্জাবিটি পেয়েছি কিন্তু সাইজ L একটু বড় হচ্ছে, এর বদলে সাইজ M পাঠালে উপকৃত হব।",
    sending: "পাঠানো হচ্ছে…",
    submit: "এক্সচেঞ্জ অনুরোধ জমা দিন (Submit Request)",
  },
  en: {
    nameErr: "Please enter your name.",
    phoneErr: "Enter a valid 11-digit mobile number (e.g. 017XXXXXXXX).",
    orderErr: "Enter a valid order number.",
    detailsErr: "Describe which product and which size you want to change.",
    sendFail: "The request could not be sent. Please try again.",
    sendFailShort: "The request could not be sent.",
    doneTitle: "Exchange request received!",
    thanks: "Thank you",
    doneBody1: "! Your size-change request for order",
    doneBody2: "has been submitted. Our customer support team will call you shortly to arrange an exchange rider.",
    again: "Make another request",
    formTitle: "Quick size exchange form",
    formSub: "Use the form below for any size change within 7 days of delivery.",
    name: "Your name *",
    namePh: "Your full name",
    phone: "Mobile number *",
    order: "Order ID *",
    reason: "Request type *",
    details: "Required size and details *",
    detailsPh: "e.g. I received the panjabi but size L is a bit big; size M would suit me better.",
    sending: "Sending…",
    submit: "Submit exchange request",
  },
} as const;

export function ExchangeForm() {
  const { lang } = useLanguage();
  const c = COPY[lang === "bn" ? "bn" : "en"];
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState<string>(REASONS[0].value);
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
      setError(c.nameErr);
      return;
    }
    if (!/^(\+?88)?01[0-9]{9}$/.test(cleanPhone)) {
      setError(c.phoneErr);
      return;
    }
    if (cleanOrderId.length < 5) {
      setError(c.orderErr);
      return;
    }
    if (details.trim().length < 5) {
      setError(c.detailsErr);
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
        // A server error text is passed through as the API returned it.
        throw new Error(data?.error ?? c.sendFail);
      }

      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : c.sendFailShort);
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
          {c.doneTitle}
        </h3>
        <p className="mt-2 text-xs leading-relaxed text-emerald-900/80 sm:text-sm max-w-md mx-auto">
          {lang === "bn" ? (
            <>{c.thanks} <strong>{name}</strong>{c.doneBody1} <strong>#{orderId}</strong> {c.doneBody2}</>
          ) : (
            <>{c.thanks}, <strong>{name}</strong>{c.doneBody1} <strong>#{orderId}</strong> {c.doneBody2}</>
          )}
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
          {c.again}
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
            {c.formTitle}
          </h3>
          <p className="text-xs text-ink-soft">
            {c.formSub}
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
            <span className={label}>{c.name}</span>
            <input
              required
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={c.namePh}
            />
          </label>

          <label className="block">
            <span className={label}>{c.phone}</span>
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
            <span className={label}>{c.order}</span>
            <input
              required
              className={field}
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              placeholder="PS-YYYYMMDD-XXXX"
            />
          </label>

          <label className="block">
            <span className={label}>{c.reason}</span>
            <select
              className={field}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{lang === "bn" ? r.bn : r.en}</option>
              ))}
            </select>
          </label>
        </div>

        <label className="block">
          <span className={label}>{c.details}</span>
          <textarea
            required
            rows={3}
            className={field}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder={c.detailsPh}
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full h-12 rounded-full bg-forest-800 font-semibold text-xs text-ivory-50 transition-colors hover:bg-forest-900 disabled:opacity-60"
        >
          {submitting ? c.sending : c.submit}
        </button>
      </form>
    </div>
  );
}
