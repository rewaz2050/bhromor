"use client";

import Link from "next/link";
import { useCustomer } from "@/lib/use-customer";
import { useSmartCard } from "@/lib/use-smart-card";
import { useLanguage } from "@/components/i18n/language-provider";
import {
  IconCheck,
  IconGift,
  IconStar,
  IconSparkles,
} from "@/components/ui/icons";

/* Copy follows the storefront language. The Bangla text is unchanged. */
const COPY = {
  bn: {
    badge: "PROSANTI স্মার্ট কার্ড",
    teaserHead: "১০টা স্ট্যাম্প পূর্ণ করলেই আকর্ষণীয় পুরস্কার একদম ফ্রি",
    teaserP1: "প্রতিটি অর্ডারে ",
    teaserS1: "১টি করে স্ট্যাম্প",
    teaserP2: " পড়বে, কেনা পিসের রিভিউ প্রকাশিত হলেও ১টি; ১০টি হলেই বিশেষ পুরস্কার। স্ট্যাম্প জমাতে ",
    teaserS2: "অ্যাকাউন্ট খুলতে হবে",
    teaserP3: " — কোনো ভেরিফিকেশন লাগে না, সাইন আপ করলেই সাথে সাথে লগ ইন হয়ে যাবে।",
    teaserCta: "ফ্রি অ্যাকাউন্ট খুলুন →",
    loading: "স্মার্ট কার্ড লোড হচ্ছে…",
    unlockedTitle: "🎉 অভিনন্দন! আপনার পুরস্কার প্রস্তুত",
    cardTitle: (t: number) => `${t}-অর্ডার স্মার্ট কার্ড`,
    unlockedSub: "আপনার বিশেষ উপহার পরবর্তী অর্ডারের সাথে পৌঁছে দেওয়া হবে।",
    lockedSub: (t: number) => `প্রতি অর্ডারে ১টি করে স্ট্যাম্প পড়বে — ${t}টি পূর্ণ হলেই আকর্ষণীয় পুরস্কার ফ্রি!`,
    yourReward: "আপনার পুরস্কার",
    reward: "পুরস্কার",
    surprise: "সারপ্রাইজ",
    claim: "পুরস্কার নিতে অর্ডার করুন →",
    wonTimes: (n: number) => ` ইতোমধ্যে ${n} বার জিতেছেন!`,
    teaserP4: "🤫 পুরস্কারটা কী, এখনই সারপ্রাইজ — ",
    teaserS3: "প্রথম অর্ডার করার সাথে সাথেই",
    teaserP5: " এখানে দেখতে পাবেন।",
    progress: "প্রগ্রেস: ",
    stampsWord: " স্ট্যাম্প",
    cycleDone: "সাইকেল সম্পূর্ণ!",
    moreLeft: (n: number) => `আর মাত্র ${n}টি অর্ডার বাকি`,
    stampFilled: (n: number) => `অর্ডার #${n}: স্ট্যাম্প পড়েছে`,
    stampTarget: (n: number) => `টার্গেট #${n}: রিওয়ার্ড আনলক স্লট`,
    stampPlain: (n: number) => `স্ট্যাম্প #${n}`,
    rewardLabel: "রিওয়ার্ড",
    progressAria: "স্মার্ট কার্ড প্রগ্রেস",
    totalOrders: (n: number) => `সর্বমোট অর্ডার: ${n} টি (প্রতি অর্ডারে ১ স্ট্যাম্প)`,
    reviewStamps: (n: number) => ` · রিভিউ স্ট্যাম্প: ${n}`,
    fullCards: (n: number) => `পূর্ণ কার্ড: ${n} বার`,
  },
  en: {
    badge: "PROSANTI Smart Card",
    teaserHead: "Fill 10 stamps and get a special reward — completely free",
    teaserP1: "Each order adds ",
    teaserS1: "1 stamp",
    teaserP2: ", and so does each published review of an item you bought. 10 stamps unlock a special reward. To collect stamps you need ",
    teaserS2: "an account",
    teaserP3: " — no verification, and signing up logs you in straight away.",
    teaserCta: "Open a free account →",
    loading: "Loading your Smart Card…",
    unlockedTitle: "🎉 Congratulations! Your reward is ready",
    cardTitle: (t: number) => `${t}-order Smart Card`,
    unlockedSub: "Your special gift will be delivered with your next order.",
    lockedSub: (t: number) => `Each order adds 1 stamp — fill ${t} and the reward is yours, free!`,
    yourReward: "Your reward",
    reward: "Reward",
    surprise: "Surprise",
    claim: "Order to claim your reward →",
    wonTimes: (n: number) => ` You've won ${n} times already!`,
    teaserP4: "🤫 What the reward is stays a surprise for now — you'll see it ",
    teaserS3: "as soon as you place your first order",
    teaserP5: " here.",
    progress: "Progress: ",
    stampsWord: " stamps",
    cycleDone: "Cycle complete!",
    moreLeft: (n: number) => `${n} more order${n === 1 ? "" : "s"} to go`,
    stampFilled: (n: number) => `Order #${n}: stamp earned`,
    stampTarget: (n: number) => `Target #${n}: reward unlock slot`,
    stampPlain: (n: number) => `Stamp #${n}`,
    rewardLabel: "Reward",
    progressAria: "Smart Card progress",
    totalOrders: (n: number) => `Total orders: ${n} (1 stamp per order)`,
    reviewStamps: (n: number) => ` · Review stamps: ${n}`,
    fullCards: (n: number) => `Full cards: ${n}×`,
  },
} as const;

/**
 * PROSANTI Smart Card — the 10-stamp loyalty card.
 * - Signed out: join teaser (account required to fill the card, no
 *   verification needed, instant login after signup).
 * - Signed in, 0 stamps: the prize is a surprise ("protom order korar por
 *   dekha jabe").
 * - Signed in, ≥1 stamp: the admin-controlled prize is revealed.
 */
export function LoyaltyCard({ className = "" }: { className?: string }) {
  const { lang } = useLanguage();
  const c = COPY[lang === "bn" ? "bn" : "en"];
  const { customer } = useCustomer();
  const { card, loading } = useSmartCard();

  if (!customer) {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl border border-gold-300 bg-gradient-to-br from-gold-50 via-paper to-ivory-100 p-6 shadow-sm sm:p-8 ${className}`}
        data-testid="loyalty-stamp-card"
      >
        <div
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gold-400/15 blur-2xl"
          aria-hidden="true"
        />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-800">
          <IconStar className="h-3.5 w-3.5 text-gold-600" /> {c.badge}
        </span>
        <h3 className="mt-2 font-display text-xl font-medium text-forest-900 sm:text-2xl">
          <IconGift className="mr-1 inline h-4 w-4 align-[-3px] text-gold-600" /> {c.teaserHead}
        </h3>
        <p className="mt-2 text-sm leading-7 text-ink-soft">
          {c.teaserP1}<strong>{c.teaserS1}</strong>{c.teaserP2}<strong>{c.teaserS2}</strong>{c.teaserP3}
        </p>
        <Link
          href="/account"
          className="editorial-button mt-5 inline-block bg-forest-800 text-white"
        >
          {c.teaserCta}
        </Link>
      </div>
    );
  }

  if (loading || !card) {
    return (
      <div
        className={`rounded-2xl border border-line bg-paper p-6 sm:p-8 ${className}`}
        data-testid="loyalty-stamp-card"
        aria-busy="true"
      >
        <p className="text-sm text-ink-soft">{c.loading}</p>
      </div>
    );
  }

  if (!card.enabled) return null;

  const { target, stamps, unlocked, revealed, cycles } = card;
  const slots = Array.from({ length: target }, (_, i) => i + 1);
  const percent = Math.min(100, Math.round((stamps / target) * 100));

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-line bg-paper p-6 shadow-sm transition-all sm:p-8 ${className}`}
      data-testid="loyalty-stamp-card"
    >
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gold-400/10 blur-2xl"
        aria-hidden="true"
      />

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-gold-800">
            <IconStar className="h-3.5 w-3.5 text-gold-600" /> {c.badge}
          </span>
          <h3 className="mt-2 font-display text-xl font-medium text-forest-900 sm:text-2xl">
            {unlocked
              ? c.unlockedTitle
              : c.cardTitle(target)}
          </h3>
          <p className="mt-1 text-xs text-ink-soft sm:text-sm">
            {unlocked
              ? c.unlockedSub
              : c.lockedSub(target)}
          </p>
        </div>

        {/* Prize chip — hidden until the first order (surprise rule) */}
        <div className="flex shrink-0 items-center gap-2 rounded-xl bg-ivory-100 px-3.5 py-2 ring-1 ring-line">
          <IconGift className="h-5 w-5 text-gold-600" />
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
              {revealed ? c.yourReward : c.reward}
            </p>
            <p
              className="text-xs font-bold text-forest-900 line-clamp-1 max-w-[180px]"
              data-testid="prize-chip"
            >
              {revealed ? card.rewardTitle : c.surprise}
            </p>
          </div>
        </div>
      </div>

      {/* Unlocked celebration */}
      {unlocked && revealed && (
        <div
          role="status"
          className="mt-6 rounded-xl border border-gold-300 bg-gradient-to-r from-gold-50 via-ivory-50 to-gold-50 p-4 text-forest-950 sm:p-5"
        >
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold-400 text-forest-950 shadow-sm">
              <IconGift className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-medium text-forest-950">
                {card.rewardTitle}
              </p>
              {card.rewardDescription && (
                <p className="mt-1 text-xs leading-relaxed text-ink-soft sm:text-sm">
                  {card.rewardDescription}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Link
                  href="/shop"
                  className="inline-flex items-center rounded-full bg-forest-800 px-4 py-1.5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-900"
                >
                  {c.claim}
                </Link>
                {cycles > 1 && (
                  <span className="text-xs font-medium text-gold-700">
                    <IconSparkles className="mr-1 inline h-4 w-4 align-[-3px] text-gold-600" />{c.wonTimes(cycles)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prize reveal teaser — first order not placed yet */}
      {!revealed && !unlocked && (
        <p
          className="mt-5 rounded-xl border border-dashed border-gold-300 bg-gold-50/60 px-4 py-3 text-xs leading-6 text-ink-soft sm:text-sm"
          data-testid="prize-teaser"
        >
          {c.teaserP4}<strong className="text-forest-900">{c.teaserS3}</strong>{c.teaserP5}
        </p>
      )}

      {/* Stamp grid */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between text-xs font-medium text-ink-soft">
          <span>
            {c.progress}<strong className="text-forest-900">{stamps}</strong> / {target}{c.stampsWord}
          </span>
          <span>
            {unlocked
              ? c.cycleDone
              : c.moreLeft(target - stamps)}
          </span>
        </div>

        <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-10 sm:gap-3">
          {slots.map((num) => {
            const isFilled = num <= stamps;
            const isTargetSlot = num === target;
            return (
              <div
                key={num}
                className={`group relative flex flex-col items-center justify-center rounded-xl p-2.5 text-center transition-all ${
                  isFilled
                    ? "border border-gold-400 bg-gradient-to-b from-forest-800 to-forest-900 text-gold-200 shadow-sm ring-1 ring-gold-400/40"
                    : isTargetSlot
                      ? "border border-dashed border-gold-400 bg-gold-50/50 text-gold-700 hover:border-gold-500"
                      : "border border-dashed border-line bg-ivory-50 text-ink-soft hover:border-line-strong"
                }`}
                title={
                  isFilled
                    ? c.stampFilled(num)
                    : isTargetSlot
                      ? c.stampTarget(num)
                      : c.stampPlain(num)
                }
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full">
                  {isFilled ? (
                    <IconCheck className="h-4 w-4 text-gold-300 stroke-[2.5]" />
                  ) : isTargetSlot ? (
                    <IconGift className="h-4 w-4 text-gold-600" />
                  ) : (
                    <span className="font-mono text-xs font-semibold text-ink-soft/70">
                      {num}
                    </span>
                  )}
                </div>
                <span
                  className={`mt-1 text-[10px] font-medium leading-none ${
                    isFilled
                      ? "text-gold-200/90"
                      : isTargetSlot
                        ? "font-semibold text-gold-700"
                        : "text-ink-soft/60"
                  }`}
                >
                  {isTargetSlot ? c.rewardLabel : `#${num}`}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="mt-4">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-ivory-200 ring-1 ring-line/50"
            role="progressbar"
            aria-valuenow={stamps}
            aria-valuemin={0}
            aria-valuemax={target}
            aria-label={c.progressAria}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-gold-500 to-forest-800 transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-ink-soft">
            <span>
              {c.totalOrders(card.orderCount)}
              {card.reviewStamps > 0 ? c.reviewStamps(card.reviewStamps) : ""}
            </span>
            {card.cycles > 0 && <span>{c.fullCards(card.cycles)}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
