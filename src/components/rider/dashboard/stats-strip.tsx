import type { RiderStatsView } from "@/lib/use-rider";

/**
 * The rider's scoreboard: live counts from the feed, plus lifetime, 7-day and
 * rating from /api/rider/stats. "…" until those figures arrive — never a fake 0.
 */
export function StatsStrip({
  activeTrips,
  deliveredCount,
  stats,
}: {
  activeTrips: number;
  deliveredCount: number;
  stats: RiderStatsView | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-2xl border border-line bg-paper p-3.5 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
          চলমান ডেলিভারি
        </p>
        <p className="font-display mt-1 text-2xl font-bold text-forest-900">
          {activeTrips}
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-paper p-3.5 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
          ফিডে সম্পন্ন
        </p>
        <p className="font-display mt-1 text-2xl font-bold text-emerald-700">
          {deliveredCount}
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-paper p-3.5 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
          মোট ডেলিভারি
        </p>
        <p className="font-display mt-1 text-2xl font-bold text-forest-900">
          {stats?.totalDeliveries ?? "…"}
        </p>
        <p className="mt-0.5 text-[10px] text-ink-soft">
          {stats ? "সর্বমোট" : "হিসাব হচ্ছে…"}
        </p>
      </div>
      <div className="rounded-2xl border border-line bg-paper p-3.5 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
          ৭ দিনে
        </p>
        <p className="font-display mt-1 text-2xl font-bold text-emerald-700">
          {stats?.weekDeliveries ?? "…"}
        </p>
        <p className="mt-0.5 text-[10px] text-ink-soft">
          {stats && stats.ratingCount > 0
            ? `⭐ ${stats.ratingAvg.toFixed(1)} (${stats.ratingCount})`
            : stats
              ? "এখনো রেটিং নেই"
              : "\u00a0"}
        </p>
      </div>
    </div>
  );
}
