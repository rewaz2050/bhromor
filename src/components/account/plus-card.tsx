"use client";

/**
 * PROSANTI+ on the account page (P2 #17) — the whole membership loop in one
 * card: what it is, what it costs, apply with the wallet TRXID, and the real
 * expiry date. The delivery waiver itself is decided at order placement by
 * the database (ps_place_order), never by this page — this card can only
 * ever report, promise and request.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/components/i18n/language-provider";
import { useCustomer } from "@/lib/use-customer";
import { formatBdt } from "@/lib/format";

interface MembershipStatus {
  state: "none" | "pending" | "active" | "expired" | "rejected";
  expiresAt: number | null;
  pricePaisa?: number;
  enabled?: boolean;
}

const MONTH_OPTIONS = [1, 3, 6, 12];

export default function PlusCard() {
  const { customer } = useCustomer();
  const { lang } = useLanguage();
  const [status, setStatus] = useState<MembershipStatus | null>(null);
  const [wallets, setWallets] = useState<{ bkash?: string; nagad?: string }>({});
  const [showForm, setShowForm] = useState(false);
  const [months, setMonths] = useState(1);
  const [payMethod, setPayMethod] = useState<"bkash" | "nagad">("bkash");
  const [trxid, setTrxid] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const acctPhone = customer?.phone ?? "";
  const load = useCallback(async () => {
    if (!acctPhone) return;
    try {
      const res = await fetch(
        `/api/membership?phone=${encodeURIComponent(acctPhone)}`,
        { cache: "no-store" },
      );
      if (res.ok) setStatus((await res.json()) as MembershipStatus);
    } catch {
      /* offline: the card just keeps the last truth */
    }
  }, [acctPhone]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- card boot
    void load();
    void fetch("/api/payments")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setWallets(d as { bkash?: string; nagad?: string }))
      .catch(() => undefined);
  }, [load]);

  const price = status?.pricePaisa ?? 9900;
  const amount = useMemo(() => price * months, [price, months]);
  const state = status?.state ?? "none";

  const send = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: customer?.name ?? "",
          phone: customer?.phone ?? "",
          months,
          payMethod,
          trxid: trxid.trim().toUpperCase(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (res.ok) {
        setMessage(data.message ?? "Sent!");
        setTrxid("");
        setShowForm(false);
        await load();
      } else {
        setError(
          data.message && data.message.trim() !== ""
            ? data.message
            : lang === "bn"
              ? "পাঠানো যায়নি — আবার চেষ্টা করুন।"
              : "Could not send — try again.",
        );
      }
    } catch {
      setError(lang === "bn" ? "ইন্টারনেট চেক করে আবার চেষ্টা করুন।" : "Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const dateFmt = (ms: number | null) =>
    ms === null
      ? ""
      : new Intl.DateTimeFormat(lang === "bn" ? "bn-BD" : "en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Dhaka",
        }).format(new Date(ms));

  const banner: Record<string, { tone: string; text: string }> = {
    active: {
      tone: "bg-forest-50 text-forest-900 ring-forest-200",
      text:
        lang === "bn"
          ? `সক্রিয় — ${dateFmt(status?.expiresAt ?? null)} পর্যন্ত ফ্রি ডেলিভারি ও প্রায়োরিটি হ্যান্ডলিং।`
          : `Active — free delivery + priority handling until ${dateFmt(status?.expiresAt ?? null)}.`,
    },
    pending: {
      tone: "bg-gold-100/60 text-forest-900 ring-gold-300/60",
      text:
        lang === "bn"
          ? "আবেদন জমা হয়েছে — দোকান ওয়ালেট চেক করে চালু করবে (সাধারণত কয়েক ঘণ্টায়)।"
          : "Application received — the shop checks the wallet and activates, usually within a few hours.",
    },
    expired: {
      tone: "bg-ivory-200 text-ink ring-line",
      text:
        lang === "bn"
          ? `${dateFmt(status?.expiresAt ?? null)}-এ মেয়াদ শেষ — নতুন মাস যোগ করলে আগের শেষ তারিখ থেকেই বাড়বে।`
          : `Ended ${dateFmt(status?.expiresAt ?? null)} — renewing stacks months onto your last expiry, no days lost.`,
    },
    rejected: {
      tone: "bg-rose-50 text-rose-900 ring-rose-200",
      text:
        lang === "bn"
          ? "ওয়ালেটে সেই TRXID মেলেনি — নম্বর ঠিক করে আবার পাঠান, বা দোকানকে লিখুন।"
          : "That TRXID wasn’t found in the wallet — double-check the number and resend, or write to the shop.",
    },
    none: {
      tone: "bg-ivory-200 text-ink ring-line",
      text:
        lang === "bn"
          ? "এখন সদস্য নন — ৳৯৯/মাসে প্রতি অর্ডারে ফ্রি ডেলিভারি।"
          : "Not a member yet — ৳99/month buys free delivery on every order.",
    },
  };

  if (!customer) return null;
  if (status && status.enabled === false) {
    return (
      <div className="rounded-2xl bg-paper p-6 ring-1 ring-line">
        <h2 className="font-display text-lg text-forest-900">PROSANTI+</h2>
        <p className="mt-2 text-sm text-ink-soft">
          {lang === "bn"
            ? "সদস্যতা সাময়িকভাবে বন্ধ — শীঘ্রই ফিরবে।"
            : "Membership enrollment is paused by the shop — it will return soon."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-paper p-6 ring-1 ring-line" data-testid="plus-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg text-forest-900">
            PROSANTI+ <span className="text-sm font-normal text-gold-600">· {formatBdt(price)}/{lang === "bn" ? "মাস" : "mo"}</span>
          </h2>
          <p className="mt-1 max-w-prose text-sm leading-7 text-ink-soft">
            {lang === "bn"
              ? "প্রতি অর্ডারে ফ্রি ডেলিভারি + প্রায়োরিটি হ্যান্ডলিং — দোকানের bKash/Nagad নম্বরে পাঠিয়ে TRXID দিন, দোকান চালু করে দেবে।"
              : "Free delivery on every order + priority handling — send the amount to the shop’s bKash/Nagad, share the TRXID, and the shop activates you."}
          </p>
        </div>
        {(state === "none" || state === "expired" || state === "rejected") && (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="h-10 rounded-full bg-forest-800 px-4 text-xs font-semibold text-white"
          >
            {state === "none"
              ? lang === "bn"
                ? "যোগ দিন"
                : "Join PROSANTI+"
              : lang === "bn"
                ? "রিনিউ করুন"
                : "Renew"}
          </button>
        )}
      </div>

      <p className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-medium ring-1 ${banner[state]?.tone ?? banner.none.tone}`}>
        {banner[state]?.text ?? banner.none.text}
      </p>

      {showForm ? (
        <div className="mt-4 grid gap-3 rounded-2xl bg-white p-4 ring-1 ring-line sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              {lang === "bn" ? "কত মাস" : "Months"}
            </span>
            <select
              className="mt-1 h-10 w-full rounded-xl bg-ivory-100 px-3 outline-none ring-1 ring-line"
              value={months}
              onChange={(e) => setMonths(Number(e.target.value))}
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} {lang === "bn" ? "মাস" : "month"}{m > 1 ? (lang === "bn" ? "" : "s") : ""} — {formatBdt(price * m)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              {lang === "bn" ? "মাধ্যম" : "Send via"}
            </span>
            <select
              className="mt-1 h-10 w-full rounded-xl bg-ivory-100 px-3 outline-none ring-1 ring-line"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as "bkash" | "nagad")}
            >
              {wallets.bkash ? <option value="bkash">bKash · {wallets.bkash}</option> : null}
              {wallets.nagad ? <option value="nagad">Nagad · {wallets.nagad}</option> : null}
              {!wallets.bkash && !wallets.nagad ? (
                <option value="bkash">{lang === "bn" ? "ওয়ালেট নম্বর সেট করা নেই" : "no wallet configured"}</option>
              ) : null}
            </select>
          </label>
          <label className="block text-sm sm:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
              {lang === "bn" ? `ট্রান্সেকশন আইডি (পরিমাণ ${formatBdt(amount)})` : `Transaction ID (you sent ${formatBdt(amount)})`}
            </span>
            <input
              className="mt-1 h-10 w-full rounded-xl bg-ivory-100 px-3 font-mono uppercase outline-none ring-1 ring-line focus:ring-2 focus:ring-forest-500"
              value={trxid}
              onChange={(e) => setTrxid(e.target.value)}
              placeholder="e.g. 9N7AX2KLM4"
              maxLength={32}
            />
          </label>
          <div className="flex items-center gap-3 sm:col-span-2">
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || trxid.trim().length < 6}
              className="h-10 rounded-full bg-forest-800 px-5 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? (lang === "bn" ? "পাঠানো হচ্ছে…" : "Sending…") : lang === "bn" ? "আবেদন পাঠান" : "Submit application"}
            </button>
            <Link href="/contact" className="text-xs font-semibold text-forest-800 underline underline-offset-2">
              {lang === "bn" ? "সন্দেহ? দোকানকে লিখুন" : "Unsure? Ask the shop"}
            </Link>
          </div>
        </div>
      ) : null}

      {message ? (
        <p className="mt-3 text-sm font-medium text-forest-800" role="status">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm font-medium text-rose-700" role="alert">{error}</p>
      ) : null}
      <p className="mt-3 text-[0.68rem] leading-5 text-ink-soft/80">
        {lang === "bn"
          ? "সদস্যতার সুবিধা অর্ডারের মুহূর্তে ডেটাবেস যাচাই হয় — এই কার্ড শুধু জানায়। কোনো অটো-ডেবিট নেই; মেয়াদ শেষে নিজে রিনিউ করুন।"
          : "The waiver itself is verified by the database at order placement — this card only reports it. There is no auto-debit; renew after the expiry yourself."}
      </p>
      {state === "active" ? (
        <button type="button" onClick={() => setShowForm(true)} className="mt-3 text-xs font-semibold text-forest-800 underline underline-offset-2">
          {lang === "bn" ? "আরও মাস যোগ করুন" : "Add more months"}
        </button>
      ) : null}
    </div>
  );
}
