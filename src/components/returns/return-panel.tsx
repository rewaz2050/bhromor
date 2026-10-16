"use client";

/**
 * Return / exchange panel on the track page (P1 #13).
 *
 * Three honest states, all computed from the same data the timeline shows:
 *   • the tracked order IS a return pickup → say so, show its reverse-leg
 *     status;
 *   • a delivered parent has a live return → show that return's status and
 *     one tap to track the pickup leg;
 *   • a delivered parent with nothing yet → the request form, inside the
 *     real 7-day window from the proven delivery moment. The server
 *     re-checks everything (ps_return_eligible) — this UI never grants
 *     eligibility the database did not.
 */

import { formatShopDate } from "@/lib/format";
import { useMemo, useState } from "react";
import { useLanguage } from "@/components/i18n/language-provider";
import type { Order } from "@/lib/orders";
import { EXCHANGE_WINDOW_MS, exchangeCountdown } from "@/lib/exchange-window";
import { fitOptions, type FitKey } from "@/lib/review-fit";
import { IconBox, IconCheck, IconRefresh } from "@/components/ui/icons";

/* English is the source copy; the *Bn fields are the Bangla storefront copy
   for the same status, so a Bangla shopper never sees English here. */
const RETURN_STATUS_COPY: Record<
  string,
  { label: string; note: string; labelBn: string; noteBn: string }
> = {
  requested: {
    label: "Awaiting the shop's approval",
    labelBn: "দোকানের অনুমোদনের অপেক্ষায়",
    note: "The shop checks the request and tells you — tracking this order keeps updating.",
    noteBn: "দোকান অনুরোধটি যাচাই করে আপনাকে জানাবে — এই অর্ডারের ট্র্যাকিং আপডেট হতে থাকবে।",
  },
  approved: {
    label: "Approved — pickup on the way",
    labelBn: "অনুমোদিত — পিকআপ পথে",
    note: "A rider will be assigned to collect the item from your address.",
    noteBn: "আপনার ঠিকানা থেকে পণ্য নিতে একজন রাইডার নিযুক্ত হবে।",
  },
  picked_up: {
    label: "Picked up by the rider",
    labelBn: "রাইডার পণ্য নিয়েছে",
    note: "The item is on its way back to the shop.",
    noteBn: "পণ্যটি দোকানের দিকে ফিরছে।",
  },
  refunded: {
    label: "Received by the shop",
    labelBn: "দোকান পণ্য বুঝে পেয়েছে",
    note: "The exchange or refund is handled by the shop from here — they will reach out on the number you ordered with.",
    noteBn: "এরপর বদল বা ফেরত দোকানই দেখবে — অর্ডারের সময় যে নম্বর দিয়েছিলেন, সেখানে তারা যোগাযোগ করবে।",
  },
  rejected: {
    label: "Not approved",
    labelBn: "অনুমোদন হয়নি",
    note: "The shop could not take this one. If that seems wrong, call them on the number below with the order ID.",
    noteBn: "দোকান এই অনুরোধটি নিতে পারেনি। মনে হলে নিচের নম্বরে অর্ডার আইডিসহ কল করুন।",
  },
};

const REASONS = [
  { value: "size", label: "Wrong / uncomfortable size", labelBn: "সাইজ ঠিক নয় / আরামদায়ক নয়" },
  { value: "color", label: "Colour swap", labelBn: "রঙ বদল" },
  { value: "defective", label: "Defective or damaged item", labelBn: "ত্রুটিপূর্ণ বা ক্ষতিগ্রস্ত পণ্য" },
  { value: "other", label: "Other reason", labelBn: "অন্য কারণ" },
];

export default function ReturnPanel({
  order,
  onTrack,
}: {
  order: Order;
  /** Pre-fill the track form with a pickup-leg order number. */
  onTrack: (orderNo: string, phone: string) => void;
}) {
  const { t, lang } = useLanguage();
  const deliveredAt = useMemo(
    () => order.timeline.find((t) => t.status === "delivered")?.at,
    [order],
  );
  const windowEndsAt = deliveredAt ? deliveredAt + EXCHANGE_WINDOW_MS : null;
  // Both date computations live with the other hooks (before any early
  // return) so the hook order is stable across order lookups.
  // eslint-disable-next-line react-hooks/purity -- a 7-day window can only be evaluated against the wall clock at render
  const nowMs = Date.now();
  const expired = windowEndsAt !== null && nowMs > windowEndsAt;
  // "Within 7 days" is a policy; "আর ৫ দিন" is information (post-purchase
  // pass, 2026-10-06) — on day six nobody should have to do the arithmetic.
  const countdown = exchangeCountdown(deliveredAt, nowMs, lang);
  const windowDate = useMemo(
    () =>
      windowEndsAt === null
        ? ""
        : formatShopDate(windowEndsAt, {
            day: "numeric",
            month: "long",
            year: "numeric",
          }),
    [windowEndsAt],
  );

  const [reason, setReason] = useState("size");
  // A size return is the most honest fit signal a shop gets: somebody
  // bothered to send the piece back. One tap while they are already here.
  const [fit, setFit] = useState<FitKey | null>(null);
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  // ---- The tracked order is itself a return pickup ------------------------
  if (order.isReturn) {
    const copy =
      RETURN_STATUS_COPY[order.returnStatus ?? "requested"] ??
      RETURN_STATUS_COPY.requested;
    return (
      <section
        aria-label={lang === "bn" ? "ফেরত পিকআপের বিবরণ" : "Return pickup details"}
        className="rounded-3xl bg-sky-50 p-6 ring-1 ring-sky-200"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sky-700 text-white">
            <IconRefresh className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold text-forest-900">
              {lang === "bn" ? "ফেরত / বদল পিকআপ" : "Return / exchange pickup"}
            </p>
            <p className="mt-0.5 text-sm leading-6 text-ink-soft">
              {lang === "bn"
                ? "একজন রাইডার আপনার ঠিকানা থেকে পণ্য নিয়ে দোকানে ফিরিয়ে দেবে। মোট: ৳০ — পিকআপের জন্য কোনো পেমেন্ট নেই।"
                : "A rider collects the item from your address and brings it back to the shop. Total: ৳0 — no payment for the pickup leg."}
            </p>
          </div>
          <span className="rounded-full bg-sky-200 px-3 py-1 text-xs font-bold uppercase tracking-wide text-sky-900">
            {lang === "bn" ? copy.labelBn : copy.label}
          </span>
        </div>
        {order.returnReason && (
          <p className="mt-3 text-xs leading-5 text-ink-soft">
            <strong className="text-ink">{lang === "bn" ? "কারণ:" : "Reason:"}</strong> {order.returnReason}
          </p>
        )}
        <p className="mt-2 text-xs leading-5 text-ink-soft">{lang === "bn" ? copy.noteBn : copy.note}</p>
      </section>
    );
  }

  // ---- Only delivered parents can start a return --------------------------
  if (order.status !== "delivered") return null;

  // ---- A live return already exists for this parent -----------------------
  const child = order.returnChild;
  if (child) {
    const copy = RETURN_STATUS_COPY[child.returnStatus] ?? RETURN_STATUS_COPY.requested;
    return (
      <section
        aria-label={lang === "bn" ? "ফেরতের অবস্থা" : "Return status"}
        className="rounded-3xl bg-paper p-6 ring-1 ring-line"
      >
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-ink-soft">
          {lang === "bn" ? "আপনার ফেরত / বদল" : "Your return / exchange"}
        </h3>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-display text-lg text-forest-900">{lang === "bn" ? copy.labelBn : copy.label}</p>
            <p className="mt-1 max-w-md text-xs leading-5 text-ink-soft">
              {lang === "bn" ? copy.noteBn : copy.note}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onTrack(child.orderNo, order.customer.phone)}
            className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2.5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconBox className="h-3.5 w-3.5" />
            {lang === "bn" ? "পিকআপ ট্র্যাক করুন" : "Track pickup"} · {child.orderNo}
          </button>
        </div>
      </section>
    );
  }

  // ---- Nothing yet: inside or outside the window --------------------------
  if (created) {
    return (
      <section
        aria-label={lang === "bn" ? "ফেরতের অনুরোধ গৃহীত" : "Return request accepted"}
        className="rounded-3xl border border-emerald-200 bg-emerald-50/70 p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-700 text-white">
            <IconCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-semibold text-forest-900">
              {lang === "bn" ? "পিকআপের অনুরোধ দোকানে পাঠানো হয়েছে" : "Pickup request sent to the shop"}
            </p>
            <p className="mt-1 text-sm leading-6 text-ink-soft">
              {lang === "bn" ? (
                <>
                  পিকআপের অর্ডার নম্বরটি রাখুন{" "}
                  <strong className="font-mono text-ink">{created}</strong> —
                  একই ফোন নম্বর দিয়ে ট্র্যাক করলে রাইডারের অংশটি চলার সাথে সাথে
                  দেখতে পাবেন।
                </>
              ) : (
                <>
                  Keep the pickup order number{" "}
                  <strong className="font-mono text-ink">{created}</strong> —
                  track it with the same phone number and you will see the
                  rider&apos;s leg as it happens.
                </>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onTrack(created, order.customer.phone)}
            className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2.5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconBox className="h-3.5 w-3.5" />
            {lang === "bn" ? "পিকআপ ট্র্যাক করুন" : "Track pickup"}
          </button>
        </div>
      </section>
    );
  }

  if (!windowEndsAt) {
    return (
      <section className="rounded-3xl bg-paper p-6 ring-1 ring-line">
        <p className="text-sm leading-6 text-ink-soft">
          {lang === "bn"
            ? "এই অর্ডারের ডেলিভারির তারিখ নিশ্চিত করা যাচ্ছে না, তাই বদলের সময়সীমা দেখানো হচ্ছে না। পণ্যে কোনো সমস্যা থাকলে অর্ডার আইডিসহ যোগাযোগ পেজে লিখুন — দোকান দেখবে।"
            : "We cannot confirm the delivery date of this order, so the exchange window is not shown. If something is wrong with your item, use the contact page with the order ID and the shop will check it."}
        </p>
      </section>
    );
  }

  if (expired) {
    return (
      <section className="rounded-3xl bg-paper p-6 ring-1 ring-line">
        <p className="text-sm leading-6 text-ink-soft">
          {lang === "bn"
            ? `এই অর্ডারের ৭ দিনের বদলের সময়সীমা ${windowDate} তারিখে শেষ হয়েছে। ডেলিভারির সময় দেখা যায়নি এমন কোনো ত্রুটি থাকলে অর্ডার আইডিসহ যোগাযোগ পেজে লিখুন — দোকান প্রতিটি কেস আলাদাভাবে দেখবে।`
            : `The 7-day exchange window for this order ended on ${windowDate}. If the item has a fault that was not visible on delivery, use the contact page with the order ID — the shop will look at it case by case.`}
        </p>
      </section>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (details.trim().length < 5) {
      setError(lang === "bn" ? "দোকানকে একটু বিস্তারিত বলুন — এক বাক্যই যথেষ্ট।" : "Tell the shop a little more — a sentence is enough.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: order.id,
          phone: order.customer.phone,
          reason,
          details: details.trim(),
          fit: reason === "size" && fit ? fit : undefined,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        order?: { id?: string };
        error?: string;
      } | null;
      if (res.ok && data?.order?.id) {
        setCreated(data.order.id);
      } else {
        setError(
          data?.error ?? (lang === "bn" ? "অনুরোধটি পাঠানো যায়নি — আবার চেষ্টা করুন।" : "The request could not be sent — try again."),
        );
      }
    } catch {
      setError(lang === "bn" ? "দোকানে পৌঁছানো যাচ্ছে না — ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।" : "Could not reach the shop — check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-3xl bg-paper p-6 ring-1 ring-line">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-ink-soft">
          {lang === "bn" ? "ফেরত / বদল" : "Return / exchange"}
        </h3>
        {countdown && !countdown.closed && (
          <p
            data-testid="exchange-countdown"
            className={`text-xs font-semibold ${
              countdown.closing ? "text-amber-700" : "text-ink-soft"
            }`}
          >
            {countdown.closing
              ? t("track.exchangeClosing")
              : t("track.exchangeLeft").replace("{left}", countdown.label)}
          </p>
        )}
      </div>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        {lang === "bn" ? (
          <>
            সাইজ বা রঙ ঠিক না হলে বাসা থেকে রাইডার পণ্য নিয়ে দোকানে ফিরিয়ে দিতে
            পারবে — বিনামূল্যে, <strong className="text-ink">{windowDate}</strong>{" "}
            পর্যন্ত (ডেলিভারির ৭ দিন)।
          </>
        ) : (
          <>
            Wrong size or colour? A rider can pick the item up from your home and
            bring it back to the shop — free, until{" "}
            <strong className="text-ink">{windowDate}</strong> (7 days from
            delivery).
          </>
        )}
      </p>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={lang === "bn" ? "ফেরতের কারণ" : "Return reason"}>
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={reason === r.value}
              onClick={() => setReason(r.value)}
              className={`min-h-11 rounded-full px-4 text-xs font-medium transition-colors ${
                reason === r.value
                  ? "bg-forest-800 font-semibold text-ivory-50"
                  : "bg-paper text-ink ring-1 ring-line hover:ring-forest-400"
              }`}
            >
              {lang === "bn" ? r.labelBn : r.label}
            </button>
          ))}
        </div>
        {reason === "size" ? (
          <div>
            <p className="mb-1.5 text-sm font-medium text-ink">
              সাইজ কেমন পেয়েছিলেন? / How did the size feel?{" "}
              <span className="font-normal text-ink-soft">(ঐচ্ছিক)</span>
            </p>
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label={lang === "bn" ? "সাইজ কেমন লেগেছে" : "How the size felt"}
            >
              {fitOptions(lang).map((option) => (
                <button
                  key={option.key}
                  type="button"
                  role="radio"
                  aria-checked={fit === option.key}
                  data-testid={`return-fit-${option.key}`}
                  onClick={() => setFit(option.key)}
                  className={`min-h-11 rounded-full px-4 text-xs font-medium transition-colors ${
                    fit === option.key
                      ? "bg-forest-800 font-semibold text-ivory-50"
                      : "bg-paper text-ink ring-1 ring-line hover:ring-forest-400"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <textarea
          value={details}
          onChange={(e) => {
            setDetails(e.target.value);
            if (error) setError(null);
          }}
          rows={3}
          maxLength={400}
          placeholder={lang === "bn" ? "যেমন: পাঞ্জাবিটা বুকের কাছে একটু টাইট — L-এর বদলে M লাগত।" : "e.g. The panjabi is a bit tight across the chest — size M instead of L."}
          className="w-full resize-y rounded-2xl bg-ivory-50 px-4 py-3 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:outline-none focus:ring-2 focus:ring-forest-500"
        />
        {error && (
          <p role="alert" className="text-xs font-medium text-rose-800">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex h-12 items-center justify-center rounded-full bg-forest-800 px-6 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
        >
          {submitting
            ? lang === "bn" ? "পাঠানো হচ্ছে…" : "Sending…"
            : lang === "bn" ? "বাসা থেকে পিকআপ চাই" : "Request home pickup"}
        </button>
      </form>
    </section>
  );
}
