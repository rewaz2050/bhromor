"use client";

/**
 * /rider/earnings — the rider's money page (202609300002, audit item N).
 *
 * Three numbers that used to blur together are kept apart on purpose:
 *   • wallet (platform owes the rider — tips + per-delivery fees),
 *   • COD cash in hand (the rider owes the platform, settled separately),
 *   • payout history (what already left the office).
 *
 * The rates come from Admin → Money (site_settings) and are shown verbatim,
 * so a rider can see WHY a delivery credited what it did.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRiderSession } from "@/lib/use-rider";
import { useRiderEarnings, type RiderMoneyKind } from "@/lib/use-rider-money";
import { formatBdt } from "@/lib/format";

const KIND_LABEL: Record<RiderMoneyKind, string> = {
  tip: "💝 টিপ",
  delivery_fee: "🛵 ডেলিভারি ফি",
  cod_handling: "💵 ক্যাশ হ্যান্ডলিং",
  incentive: "🎁 ইনসেনটিভ",
  payout: "🏦 উত্তোলন (হোল্ড)",
  payout_refund: "↩️ উত্তোলন বাতিল (ফেরত)",
  adjustment: "⚖️ সমন্বয়",
  cod_netting: "🤝 ক্যাশ জমার সাথে সমন্বয়",
};

const STATUS_LABEL: Record<"pending" | "paid" | "rejected", string> = {
  pending: "অপেক্ষায়",
  paid: "পরিশোধিত",
  rejected: "বাতিল",
};

const fmtWhen = (ts: number): string =>
  ts > 0
    ? new Date(ts).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function RiderEarningsPage() {
  const session = useRiderSession();
  const isLive = session.status === "authed";
  const money = useRiderEarnings(isLive);
  const { summary, entries, payouts, ready } = money;

  const [amount, setAmount] = useState("");
  // A rider's payout destination is the same every time — seed the fields from
  // the last request (client-only; the form never renders during SSR, so no
  // hydration mismatch from reading localStorage in an initialiser).
  const [method, setMethod] = useState(
    () => (typeof window === "undefined" ? "" : window.localStorage.getItem("prosanti-rider-payout-method")) || "bkash",
  );
  const [account, setAccount] = useState(
    () => (typeof window === "undefined" ? "" : window.localStorage.getItem("prosanti-rider-payout-account")) || "",
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pendingPayout = useMemo(
    () => payouts.find((p) => p.status === "pending") ?? null,
    [payouts],
  );

  const submit = async () => {
    setFormError(null);
    setDone(null);
    const taka = Number(amount);
    if (!Number.isFinite(taka) || taka <= 0) {
      setFormError("কত টাকা উত্তোলন করতে চান লিখুন।");
      return;
    }
    if (summary && taka * 100 > summary.balance) {
      setFormError("আপনার আয়ের ব্যালেন্সে এত টাকা নেই।");
      return;
    }
    setSaving(true);
    const result = await money.requestPayout({
      amountTaka: taka,
      method,
      account: account.trim(),
    });
    setSaving(false);
    if (!result.ok) {
      setFormError(result.error ?? "অনুরোধ নেওয়া যায়নি।");
      return;
    }
    window.localStorage.setItem("prosanti-rider-payout-account", account.trim());
    window.localStorage.setItem("prosanti-rider-payout-method", method);
    setAmount("");
    setDone("উত্তোলনের অনুরোধ অ্যাডমিনের কাছে গেছে — অনুমোদন হলে bKash/ব্যাংকে টাকা পাবেন।");
  };

  if (!isLive) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center" aria-label="Loading">
        <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-line/70" />
        <p className="mt-4 text-sm text-ink-soft">আয়ের হিসাব আনা হচ্ছে…</p>
      </div>
    );
  }

  if (!ready || !summary) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link href="/rider" className="text-xs font-semibold text-forest-800 underline">
          ← ড্যাশবোর্ডে ফিরে যান
        </Link>
        <div
          role="status"
          className="mt-4 rounded-2xl bg-amber-50 p-6 text-sm text-amber-900 ring-1 ring-amber-200"
        >
          <p className="font-semibold">আয়ের পেজ এখনো চালু হয়নি</p>
          <p className="mt-2">
            ব্যাকএন্ড আপডেট (migration <code>202609300002_rider_money.sql</code>) এখনো প্রয়োগ
            হয়নি। অ্যাডমিনকে জানান — প্রয়োগ হওয়ার সাথে সাথেই টিপ, ডেলিভারি ফি আর উত্তোলনের হিসাব
            এখানে দেখা যাবে।
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <Link href="/rider" className="text-xs font-semibold text-forest-800 underline">
          ← ড্যাশবোর্ড
        </Link>
        <button
          type="button"
          onClick={() => void money.refresh()}
          className="rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-ivory-100"
        >
          রিফ্রেশ
        </button>
      </div>

      <h1 className="font-display text-2xl font-bold text-forest-900">আমার আয়</h1>

      {money.error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
          {money.error}
        </p>
      )}

      {/* The three numbers, never merged: wallet / cash custody / paid out. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-forest-800 p-5 ring-1 ring-forest-800">
          <p className="text-xs font-semibold uppercase tracking-wider text-forest-100">
            ওয়ালেট (প্ল্যাটফর্ম পাওনা)
          </p>
          <p data-testid="earnings-balance" className="mt-1 font-display text-2xl text-white">
            {formatBdt(summary.balance)}
          </p>
          <p className="mt-1 text-[11px] text-forest-100">
            টিপ + ডেলিভারি ফি − উত্তোলনের হোল্ড
          </p>
        </div>
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            হাতের ক্যাশ (COD)
          </p>
          <p data-testid="earnings-cash" className="mt-1 font-display text-2xl text-forest-900">
            {formatBdt(summary.cashInHand)}
          </p>
          <p className="mt-1 text-[11px] text-ink-soft">এটা আপনার আয় নয় — অফিসে জমা দিতে হবে</p>
        </div>
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
            এখন পর্যন্ত উত্তোলন
          </p>
          <p data-testid="earnings-paid-out" className="mt-1 font-display text-2xl text-forest-900">
            {formatBdt(summary.paidOut)}
          </p>
          {summary.pendingPayout > 0 && (
            <p className="mt-1 text-[11px] font-semibold text-amber-700">
              {formatBdt(summary.pendingPayout)} অনুমোদনের অপেক্ষায়
            </p>
          )}
        </div>
      </div>

      {/* Today / week / lifetime */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: "আজ", value: summary.today, sub: `${summary.deliveriesToday} ডেলিভারি` },
          { label: "৭ দিন", value: summary.week, sub: "গত এক সপ্তাহ" },
          { label: "সর্বমোট", value: summary.lifetime, sub: "শুরু থেকে" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl bg-ivory-100 p-4 ring-1 ring-line">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              {card.label}
            </p>
            <p className="mt-1 font-display text-xl text-forest-900">{formatBdt(card.value)}</p>
            <p className="text-[11px] text-ink-soft">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Per-delivery rates — the why behind each credit. */}
      <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
          প্রতি ডেলিভারিতে আয়
        </p>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-forest-900">
          <span>
            ডেলিভারি ফি: <strong>{formatBdt(summary.baseFee)}</strong>
          </span>
          <span>
            COD হ্যান্ডলিং: <strong>{formatBdt(summary.codHandlingFee)}</strong>
          </span>
          <span>
            টিপ: <strong>১০০% আপনার</strong>
          </span>
        </div>
        {summary.baseFee === 0 && summary.codHandlingFee === 0 && (
          <p className="mt-2 text-[11px] text-amber-700">
            অ্যাডমিন এখনো প্রতি-ডেলিভারি রেট সেট করেননি — টিপ ছাড়া অন্য আয় এখন ৳০।
          </p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] text-ink-soft">
          <span className="rounded-xl bg-ivory-100 px-2 py-1.5">
            টিপ {formatBdt(summary.tips)}
          </span>
          <span className="rounded-xl bg-ivory-100 px-2 py-1.5">
            ফি {formatBdt(summary.deliveryFees)}
          </span>
          <span className="rounded-xl bg-ivory-100 px-2 py-1.5">
            ক্যাশ হ্যান্ডলিং {formatBdt(summary.codHandling)}
          </span>
        </div>
      </div>

      {/* Withdrawal */}
      <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
        <h2 className="font-display text-lg font-bold text-forest-900">টাকা উত্তোলন</h2>
        {pendingPayout ? (
          <p className="mt-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
            {formatBdt(pendingPayout.amount)} উত্তোলনের অনুরোধ {fmtWhen(pendingPayout.requestedAt)} এ
            জমা হয়েছে ({pendingPayout.method}) — অনুমোদন হলে জানানো হবে। একসাথে একটির বেশি অনুরোধ
            রাখা যায় না।
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-ink-soft">
              সর্বনিম্ন {formatBdt(summary.minPayout)} · ব্যালেন্স {formatBdt(summary.balance)}
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                  পরিমাণ (৳)
                </span>
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-ivory-50 px-3 py-2 text-sm"
                  placeholder="500"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                  মাধ্যম
                </span>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-ivory-50 px-3 py-2 text-sm"
                >
                  <option value="bkash">bKash</option>
                  <option value="nagad">Nagad</option>
                  <option value="bank">ব্যাংক</option>
                  <option value="cash">হাতে হাতে (অফিসে)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                  নম্বর / অ্যাকাউন্ট
                </span>
                <input
                  type="text"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-ivory-50 px-3 py-2 text-sm"
                  placeholder="01XXXXXXXXX"
                />
              </label>
            </div>
            {formError && (
              <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
                {formError}
              </p>
            )}
            {done && (
              <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-medium text-emerald-900 ring-1 ring-emerald-200">
                {done}
              </p>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving || summary.balance <= 0}
              className="mt-3 inline-flex h-11 items-center rounded-full bg-forest-800 px-5 text-xs font-semibold text-ivory-50 hover:bg-forest-900 disabled:opacity-50"
            >
              {saving ? "পাঠানো হচ্ছে…" : "উত্তোলনের অনুরোধ করুন"}
            </button>
            {summary.balance <= 0 && (
              <p className="mt-2 text-[11px] text-ink-soft">
                ওয়ালেটে টাকা জমলে এই বোতাম চালু হবে।
              </p>
            )}
          </>
        )}
      </div>

      {/* Payout history */}
      {payouts.length > 0 && (
        <div className="rounded-2xl bg-paper ring-1 ring-line">
          <h2 className="px-5 pt-5 font-display text-lg font-bold text-forest-900">
            উত্তোলনের ইতিহাস
          </h2>
          <ul className="mt-2 divide-y divide-line">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-semibold text-forest-900">{formatBdt(p.amount)}</p>
                  <p className="text-[11px] text-ink-soft">
                    {p.method} · {p.account || "—"} · {fmtWhen(p.requestedAt)}
                    {p.reference ? ` · TRX ${p.reference}` : ""}
                  </p>
                  {p.note && <p className="text-[11px] text-ink-soft">নোট: {p.note}</p>}
                </div>
                <span
                  className={
                    p.status === "paid"
                      ? "rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800 ring-1 ring-emerald-200"
                      : p.status === "rejected"
                        ? "rounded-full bg-rose-50 px-3 py-1 text-[11px] font-semibold text-rose-800 ring-1 ring-rose-200"
                        : "rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-900 ring-1 ring-amber-200"
                  }
                >
                  {STATUS_LABEL[p.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Journal feed */}
      <div className="rounded-2xl bg-paper ring-1 ring-line">
        <h2 className="px-5 pt-5 font-display text-lg font-bold text-forest-900">
          আয়ের বিবরণ
        </h2>
        {entries.length === 0 ? (
          <p className="px-5 py-4 text-sm text-ink-soft">
            এখনো কোনো আয় জমা হয়নি — ডেলিভারি সম্পন্ন হলে টিপ ও ফি এখানে দেখা যাবে।
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <p className="font-medium text-forest-900">{KIND_LABEL[entry.kind]}</p>
                  <p className="text-[11px] text-ink-soft">
                    {entry.orderId ? `অর্ডার ${entry.orderId} · ` : ""}
                    {fmtWhen(entry.at)}
                    {entry.note ? ` · ${entry.note}` : ""}
                  </p>
                </div>
                <span
                  className={
                    entry.amount < 0
                      ? "font-display text-sm font-bold text-rose-700"
                      : "font-display text-sm font-bold text-emerald-800"
                  }
                >
                  {entry.amount < 0 ? "−" : "+"}
                  {formatBdt(Math.abs(entry.amount))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="pb-6 text-center text-[11px] text-ink-soft">
        হিসাবের কোনো গরমিল দেখলে অ্যাডমিনকে জানান — প্রতিটি এন্ট্রি অর্ডার নম্বরসহ সংরক্ষিত থাকে।
      </p>
    </div>
  );
}
