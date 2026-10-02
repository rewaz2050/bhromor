import Link from "next/link";
import { formatBdt } from "@/lib/format";
import { cashMeter } from "@/lib/rider-tasks";
import type { SettleClaim } from "@/lib/db/riders";
import { IconShield } from "@/components/ui/icons";

const TONE = { rose: "bg-rose-600", amber: "bg-amber-500", emerald: "bg-emerald-600" } as const;

/**
 * COD custody and the earnings wallet, kept visibly apart: cash in hand with
 * its safety meter toward the admin-set cap, the pending pay-in claim, and the
 * wallet balance (never settleable as COD).
 */
export function CashCard({
  cashInHand,
  limit,
  pendingClaim,
  claimsReady,
  earningsBalance,
  onSettle,
}: {
  cashInHand: number;
  /** Paisa — the admin-set dispatch cash cap. */
  limit: number;
  pendingClaim: SettleClaim | null;
  /** The cash-claim table exists on this server. */
  claimsReady: boolean;
  earningsBalance: number;
  onSettle: () => void;
}) {
  const meter = cashMeter(cashInHand, limit);
  return (
    <section
      aria-label="Cash in hand"
      className="rounded-2xl border border-line bg-ivory-100/70 p-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <IconShield className="h-4 w-4 text-gold-600" />
          <span className="text-xs font-bold uppercase tracking-wider text-forest-900">
            হাতে জমা ক্যাশ (COD)
          </span>
        </div>
        <span className="text-xs font-medium text-ink-soft">
          সীমা: {formatBdt(limit)}
        </span>
      </div>

      <div className="mt-3 flex items-baseline justify-between">
        <p className="font-display text-2xl font-bold text-forest-900">
          {formatBdt(cashInHand)}
        </p>
        {cashInHand > 0 && !pendingClaim && claimsReady && (
          <button
            type="button"
            onClick={onSettle}
            className="rounded-full bg-forest-800 px-3 py-1 text-[11px] font-semibold text-ivory-50 hover:bg-forest-900"
          >
            টাকা জমা দিন (Settle)
          </button>
        )}
      </div>
      {cashInHand > 0 && !claimsReady && (
        <p className="mt-2 rounded-xl bg-ivory-100 p-2.5 text-xs font-medium text-ink-soft ring-1 ring-line">
          টাকা জমার অনুরোধ সাময়িকভাবে বন্ধ আছে — অ্যাডমিন দ্রুত হিসাব মিলিয়ে নেবেন।
        </p>
      )}
      {pendingClaim && (
        <p className="mt-2 rounded-xl bg-amber-50 p-2.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
          ⏳ {formatBdt(pendingClaim.amount)} জমার দাবি Admin-এর কাছে অপেক্ষায় আছে
          ({pendingClaim.method.toUpperCase()}
          {pendingClaim.reference ? ` · ${pendingClaim.reference}` : ""})। Approve হলে balance কমবে।
        </p>
      )}
      {/* 202609300001 — earnings wallet (tips): NOT cash-in-hand, never
          settleable as COD; shows the platform's debt to the rider. */}
      {earningsBalance > 0 && (
        <p
          className="mt-2 rounded-xl bg-gold-50 p-2.5 text-xs font-semibold text-forest-950 ring-1 ring-gold-300"
          data-testid="rider-earnings"
        >
          🏅 আপনার আয় (টিপ ইত্যাদি): {formatBdt(earningsBalance)} — এটা ওয়ালেট,
          হাতের ক্যাশ নয়। Payout হবে Admin approve করলে।
        </p>
      )}
      {/* 202609300002 — the full statement: tips, per-delivery fees,
          payout history and the withdrawal request. Always reachable,
          also when the wallet is still empty. */}
      <Link
        href="/rider/earnings"
        data-testid="rider-earnings-link"
        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-forest-800 underline underline-offset-2"
      >
        📊 আমার আয়ের হিসাব ও উত্তোলন →
      </Link>

      {/* Progress bar toward the cash cap (admin setting) */}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ivory-200 ring-1 ring-line/40">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            TONE[meter.tone]
          }`}
          style={{
            width: `${meter.percent}%`,
          }}
        />
      </div>

      {meter.reached && (
        <p className="mt-2 text-xs font-semibold text-rose-700">
          ⚠️ ক্যাশ লিমিট পূর্ণ হয়েছে! নতুন অর্ডার পেতে অফিসে বা bKash-এ টাকা জমা দিন।
        </p>
      )}
    </section>
  );
}
