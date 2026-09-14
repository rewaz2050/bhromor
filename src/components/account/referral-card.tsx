"use client";

/**
 * The share card (P0 #7) — "you ৳50, them ৳50".
 *
 * What is honest here matters: the friend's credit is applied to their first
 * order, and YOUR ৳50 only exists once that order is delivered — the reward is
 * minted as a real single-use coupon by the database, so it cannot be inflated
 * from the browser. Until then the card says "pending", which is the truth and
 * also the reason to follow up.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useCustomer } from "@/lib/use-customer";
import { useLanguage } from "@/components/i18n/language-provider";
import { apiGet } from "@/lib/admin-api";
import { formatBdt } from "@/lib/format";
import { shareMessage } from "@/lib/referral";
import { IconCheck, IconCopy, IconSend, IconTag, IconUser } from "@/components/ui/icons";

interface ReferralData {
  display: string;
  code: string;
  link: string;
  path: string;
  paused: boolean;
  invited: number;
  rewarded: number;
  pending: number;
  creditedPaisa: number;
  minOrderPaisa: number;
  friendRewardPaisa: number;
  referrerRewardPaisa: number;
  maxRewards: number;
  coupons: { code: string; value: number; used: boolean; expiresAt: string | null }[];
}

export function ReferralCard({ className = "" }: { className?: string }) {
  const { customer } = useCustomer();
  const { lang, t } = useLanguage();
  const [data, setData] = useState<ReferralData | null>(null);
  const [failed, setFailed] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const loading = Boolean(customer) && !data && !failed;

  useEffect(() => {
    if (!customer) return;
    let alive = true;
    void apiGet<ReferralData>("/api/referral")
      .then((next) => {
        if (!alive) return;
        setData(next);
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one fetch per sign-in state
  }, [customer?.id]);

  const copy = useCallback(async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      // clipboard blocked (http, old webview) — the code is still on screen
    }
  }, []);

  if (!customer) {
    return (
      <div
        className={`rounded-2xl border border-line bg-paper p-6 ${className}`}
        data-testid="referral-card"
        data-state="signed-out"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-forest-700">
          <IconUser className="h-3.5 w-3.5" /> {t("referral.title")}
        </span>
        <p className="mt-2 text-sm leading-7 text-ink-soft">{t("referral.intro")}</p>
        <Link
          href="/account"
          className="mt-3 inline-flex h-11 items-center rounded-sm bg-forest-800 px-5 text-sm font-semibold text-ivory-50"
        >
          {t("referral.yourCode")}
        </Link>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div
        className={`rounded-2xl border border-line bg-paper p-6 ${className}`}
        data-testid="referral-card"
        data-state="loading"
      >
        <p className="text-sm text-ink-soft">{t("referral.title")}…</p>
      </div>
    );
  }

  if (data.paused) {
    return (
      <div
        className={`rounded-2xl border border-line bg-paper p-6 text-sm text-ink-soft ${className}`}
        data-testid="referral-card"
        data-state="paused"
      >
        {t("referral.pause")}
      </div>
    );
  }

  const message = shareMessage(customer.name, data.code, data.link, lang, data.friendRewardPaisa);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-gold-300 bg-gradient-to-br from-gold-50 via-paper to-ivory-100 p-6 shadow-sm sm:p-8 ${className}`}
      data-testid="referral-card"
      data-state="ready"
    >
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-800">
        <IconTag className="h-3.5 w-3.5 text-gold-600" /> {t("referral.title")}
      </span>
      <h3 className="mt-3 font-display text-xl font-medium text-forest-900 sm:text-2xl">
        {t("referral.intro")}
      </h3>
      <p className="mt-2 text-sm leading-7 text-ink-soft">
        {t("referral.rewardDetail")
          .replace("{you}", formatBdt(data.referrerRewardPaisa))
          .replace("{them}", formatBdt(data.friendRewardPaisa))}
        {data.minOrderPaisa > 0 ? (
          <> · {t("referral.minOrder").replace("{amount}", formatBdt(data.minOrderPaisa))}</>
        ) : null}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void copy(data.display, "code")}
          className="inline-flex items-center gap-2 rounded-xl bg-paper px-4 py-2.5 font-mono text-base tracking-[0.18em] text-forest-900 ring-1 ring-gold-300"
        >
          {copied === "code" ? (
            <IconCheck className="h-4 w-4 text-forest-700" />
          ) : null}
          {data.display}
        </button>
        <span className="text-xs text-ink-soft">{t("referral.codeHint")}</span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-1.5 rounded-sm bg-forest-800 px-4 text-xs font-semibold text-ivory-50"
        >
          <IconSend className="h-3.5 w-3.5" /> {t("referral.share")}
        </a>
        <button
          type="button"
          onClick={() =>
            canShare
              ? void navigator
                  .share({ title: "PROSANTI", text: message, url: data.link })
                  .catch(() => undefined)
              : void copy(message, "message")
          }
          className="inline-flex h-10 items-center gap-1.5 rounded-sm bg-paper px-4 text-xs font-semibold text-forest-800 ring-1 ring-line"
        >
          {copied === "message" ? (
            <IconCheck className="h-3.5 w-3.5" />
          ) : (
            <IconCopy className="h-3.5 w-3.5" />
          )}
          {canShare ? t("referral.copied") : t("referral.copyCode")}
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-gold-200 pt-4">
        <span className="rounded-full bg-paper px-3 py-1 text-xs font-medium text-forest-900 ring-1 ring-gold-200">
          {t("referral.invited").replace("{n}", String(data.invited))}
        </span>
        <span className="rounded-full bg-paper px-3 py-1 text-xs font-medium text-forest-900 ring-1 ring-gold-200">
          {t("referral.rewarded").replace("{n}", String(data.rewarded))}
        </span>
        <span className="rounded-full bg-paper px-3 py-1 text-xs font-medium text-forest-900 ring-1 ring-gold-200">
          {t("referral.credit")}: {formatBdt(data.creditedPaisa)}
        </span>
      </div>
      {data.creditedPaisa === 0 ? (
        <p className="mt-2 text-xs leading-5 text-ink-soft">{t("referral.noneYet")}</p>
      ) : null}
      {data.pending > 0 ? (
        <p className="mt-1 text-xs leading-5 text-ink-soft">
          {t("referral.pending").replace("{n}", String(data.pending))}
        </p>
      ) : null}

      {data.coupons.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {data.coupons.map((coupon) => (
            <li
              key={coupon.code}
              className="flex items-center justify-between gap-2 rounded-xl bg-paper/80 px-3 py-2 text-xs ring-1 ring-gold-200"
            >
              <span className="min-w-0 truncate text-ink-soft">
                {coupon.used
                  ? coupon.code
                  : t("referral.useCredit").replace("{code}", coupon.code)}{" "}
                · {formatBdt(coupon.value)}
              </span>
              {coupon.used ? null : (
                <button
                  type="button"
                  onClick={() => void copy(coupon.code, coupon.code)}
                  className="shrink-0 rounded-full bg-forest-800 px-3 py-1 font-semibold text-ivory-50"
                >
                  {copied === coupon.code ? t("referral.copied") : t("referral.copyCode")}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

