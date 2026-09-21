"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCustomer } from "@/components/account/customer-provider";
import { useLanguage } from "@/components/i18n/language-provider";
import { IconCheck, IconCopy, IconGift, IconShare } from "@/components/ui/icons";
import { formatBdt } from "@/lib/format";

/**
 * Receipt referral row — the cheapest customer a shop ever gets is the one
 * a happy shopper brings. Placed an order → this is the moment. The code
 * itself only exists for a signed-in customer (an anonymous mintable code
 * is a coupon farm — see /api/referral); guests get a quiet sign-in line.
 */

interface ReferralPayload {
  display: string;
  link: string;
  paused?: boolean;
  friendRewardPaisa: number;
  referrerRewardPaisa: number;
}

type RowState = "loading" | "ready" | "paused" | "anon" | "error";

export default function ReceiptReferralRow() {
  const { customer } = useCustomer();
  const { lang } = useLanguage();
  const [data, setData] = useState<ReferralPayload | null>(null);
  const [fetched, setFetched] = useState<"loading" | "ready" | "paused" | "error">(
    "loading",
  );
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!customer) return;
    let alive = true;
    void fetch("/api/referral", { cache: "no-store", credentials: "same-origin" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`referral ${res.status}`);
        return (await res.json()) as ReferralPayload;
      })
      .then((payload) => {
        if (!alive) return;
        setData(payload);
        setFetched(payload.paused ? "paused" : "ready");
      })
      .catch(() => {
        if (alive) setFetched("error");
      });
    return () => {
      alive = false;
    };
  }, [customer]);

  /* Guests are derived, not fetched. */
  const state: RowState = customer ? fetched : "anon";

  if (state === "loading" || state === "error" || state === "paused") return null;

  if (state === "anon") {
    return (
      <div
        data-testid="receipt-referral-signin"
        className="mt-4 flex items-start gap-2.5 rounded-2xl bg-gold-50/70 px-4 py-3 text-xs leading-5 text-ink-soft ring-1 ring-gold-200"
      >
        <IconGift className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
        <span>
          {lang === "bn"
            ? "অ্যাকাউন্টে ঢুকে নিন আপনার রেফারেল কোড — বন্ধু প্রথম অর্ডারে ৳৫০ সেভ করবে, ডেলিভারি হলে আপনিও ৳৫০ পাবেন। "
            : "Sign in to get your referral code — your friend saves ৳50 on their first order, you earn ৳50 once it's delivered. "}
          <Link
            href="/account"
            data-testid="receipt-referral-signin-link"
            className="font-semibold text-forest-800 underline underline-offset-2 hover:text-forest-950"
          >
            {lang === "bn" ? "অ্যাকাউন্ট" : "Account"}
          </Link>
        </span>
      </div>
    );
  }

  const friend = formatBdt(data?.friendRewardPaisa ?? 5000);
  const you = formatBdt(data?.referrerRewardPaisa ?? 5000);
  const code = data?.display ?? "";
  const link = data?.link ?? "";
  const shareText =
    lang === "bn"
      ? `PROSANTI-তে দেখো — চেকআউটে আমার কোড ${code} দিলে তুমি ${friend} সেভ করবে: ${link}`
      : `Check out PROSANTI — use my code ${code} at checkout and you save ${friend}: ${link}`;

  return (
    <div
      data-testid="receipt-referral"
      className="mt-4 rounded-2xl bg-gold-50/70 px-4 py-3 ring-1 ring-gold-200"
    >
      <div className="flex items-start gap-2.5">
        <IconGift className="mt-0.5 h-4 w-4 shrink-0 text-gold-600" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold leading-5 text-forest-900">
            {lang === "bn"
              ? `বন্ধুকে পাঠান — সে ${friend} সেভ করবে, আপনি ${you} পাবেন`
              : `Send a friend — they save ${friend}, you earn ${you}`}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink">
            <span
              data-testid="receipt-referral-code"
              className="select-all rounded-full bg-paper px-2.5 py-1 font-mono text-[0.72rem] font-bold tracking-wide text-forest-900 ring-1 ring-gold-300"
            >
              {code}
            </span>
            <button
              type="button"
              data-testid="receipt-referral-copy"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1800);
                } catch {
                  /* clipboard blocked — the code chip is right there */
                }
              }}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-forest-800 ring-1 ring-line hover:bg-ivory-100"
              aria-label={lang === "bn" ? "লিংক কপি" : "Copy link"}
            >
              {copied ? (
                <IconCheck className="h-3.5 w-3.5" />
              ) : (
                <IconCopy className="h-3.5 w-3.5" />
              )}
              {copied
                ? lang === "bn"
                  ? "কপি হয়েছে"
                  : "Copied"
                : lang === "bn"
                  ? "লিংক কপি"
                  : "Copy link"}
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
              target="_blank"
              rel="noreferrer"
              data-testid="receipt-referral-wa"
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-forest-800 ring-1 ring-line hover:bg-ivory-100"
            >
              <IconShare className="h-3.5 w-3.5" />
              {lang === "bn" ? "WhatsApp" : "WhatsApp"}
            </a>
          </p>
          <p className="mt-1 text-[0.68rem] leading-4 text-ink-soft">
            {lang === "bn"
              ? "পুরস্কার বন্ধুর অর্ডার ডেলিভারি হওয়ার পর কুপন হিসেবে জমা হয়।"
              : "The reward banks as a coupon once your friend's order is delivered."}
          </p>
        </div>
      </div>
    </div>
  );
}
