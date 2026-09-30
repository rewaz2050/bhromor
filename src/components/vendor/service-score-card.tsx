"use client";

/**
 * A2 (2026-09-28) — the shop's own service score over the last week.
 *
 * The numbers come from `serviceScore()` in `@/lib/vendor-dashboard`, which
 * only counts orders the dashboard already loaded. This component is
 * presentational on purpose so the honesty rules (no orders → "nothing to
 * score yet", never a fake 0%) can be asserted without rendering the whole
 * dashboard.
 */

import Link from "next/link";
import { SERVICE_WINDOW_DAYS, type ServiceScore } from "@/lib/vendor-dashboard";

export default function ServiceScoreCard({
  score,
  prepMinutes,
  loading = false,
}: {
  score: ServiceScore;
  /** The shop's own promise, in minutes (0 = not set). */
  prepMinutes: number;
  loading?: boolean;
}) {
  return (
    <section
      aria-label="Service score"
      className="mt-6 rounded-2xl bg-paper p-5 ring-1 ring-line"
      data-testid="service-score"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Service score · last {SERVICE_WINDOW_DAYS} days
        </h3>
        <p className="text-[0.68rem] text-ink-soft">
          Counted from your loaded orders — nothing is estimated.
        </p>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-ink-soft">…</p>
      ) : score.placed === 0 ? (
        <p className="mt-3 text-sm text-ink-soft" data-testid="service-empty">
          No orders in the last {SERVICE_WINDOW_DAYS} days — nothing to score yet.
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-ink-soft">Answered &amp; kept</p>
              <p className="font-display text-2xl text-forest-900" data-testid="service-fulfilment">
                {Math.round((score.fulfilmentRate ?? 0) * 100)}%
              </p>
              <p className="text-[0.68rem] text-ink-soft">
                {score.placed} placed
                {score.cancelled > 0 ? ` · ${score.cancelled} cancelled` : ""}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-soft">Median dispatch</p>
              <p className="font-display text-2xl text-forest-900" data-testid="service-dispatch">
                {score.medianDispatchMinutes === null ? "—" : `${score.medianDispatchMinutes} min`}
              </p>
              <p className="text-[0.68rem] text-ink-soft">
                {score.dispatched > 0
                  ? `${score.dispatched} handed to a rider`
                  : "nothing dispatched yet"}
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-soft">Within your prep time</p>
              <p className="font-display text-2xl text-forest-900" data-testid="service-ontime">
                {score.onTimeRate === null ? "—" : `${Math.round(score.onTimeRate * 100)}%`}
              </p>
              <p className="text-[0.68rem] text-ink-soft">
                {prepMinutes > 0 ? (
                  `promise: ${prepMinutes} min`
                ) : (
                  <>
                    <Link
                      href="/vendor/settings"
                      className="font-semibold text-forest-800 underline underline-offset-2"
                    >
                      Set a prep time
                    </Link>{" "}
                    to score this
                  </>
                )}
              </p>
            </div>
          </div>
          {score.returns > 0 && (
            <p className="mt-3 text-xs text-ink-soft" data-testid="service-returns">
              Returns: {score.returns}
              {score.refunded > 0 ? ` · ${score.refunded} refunded` : " · none refunded yet"}
            </p>
          )}
        </>
      )}
    </section>
  );
}
