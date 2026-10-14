"use client";

/**
 * Today's bonus target, on the screen the rider works from (2026-10-13).
 *
 * The daily target is the one number that changes what a rider does mid-shift
 * — two more drops and the bonus lands — and it lived only on
 * /rider/earnings, two taps away and behind the cash already earned. The home
 * screen showed lifetime counts and a rating footnote but nothing to aim at.
 *
 * Renders nothing when staff have the daily bonus switched off, for the same
 * reason the earnings card does: never show a rider a promise the shop is not
 * making. One line, one bar, and a link through to the full breakdown.
 */

import Link from "next/link";

import { formatBdt } from "@/lib/format";
import { dailyBonusOn } from "@/lib/rider-incentives";
import { useRiderIncentives } from "@/lib/use-rider-incentives";

export default function IncentiveProgress({ enabled }: { enabled: boolean }) {
  const { view } = useRiderIncentives(enabled);
  if (!view || !dailyBonusOn(view.settings)) return null;

  const done = view.today?.done ?? 0;
  const target = view.today?.target ?? view.settings.dailyTarget;
  const percent = Math.max(0, Math.min(100, view.today?.percent ?? 0));
  const left = Math.max(0, view.today?.left ?? Math.max(0, target - done));
  const reached = view.today?.reached ?? false;

  return (
    <section
      aria-label="আজকের বোনাস"
      data-testid="incentive-progress"
      className="rounded-2xl border border-line bg-paper p-3.5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
          আজকের বোনাস
        </h2>
        <p className="text-xs font-semibold text-emerald-700">
          {formatBdt(view.settings.dailyBonus)}
        </p>
      </div>

      <div
        aria-hidden="true"
        className="mt-2 h-2 overflow-hidden rounded-full bg-line/60"
      >
        <div
          className={`h-full rounded-full transition-all ${reached ? "bg-emerald-500" : "bg-gold-500"}`}
          style={{ width: `${percent}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-ink-soft">
        {reached
          ? "টার্গেট পূর্ণ — বোনাস ওয়ালেটে যোগ হয়েছে।"
          : `${done}/${target} ডেলিভারি — আর ${left}টি বাকি।`}
      </p>

      <Link
        href="/rider/earnings"
        className="mt-2 inline-flex text-xs font-semibold text-forest-800 underline-offset-2 hover:underline"
      >
        পুরো হিসাব দেখুন
      </Link>
    </section>
  );
}
