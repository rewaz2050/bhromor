import type { RatingSummary } from "@/lib/rider-rating";

const fmtDay = (ts: number): string => new Date(ts).toLocaleDateString("bn-BD", { day: "numeric", month: "short" });

/** Rating breakdown for the profile tab. Renders nothing until there is at least one rating. */
export default function RatingCard({ summary }: { summary: RatingSummary | null }) {
  if (!summary || summary.count === 0) return null;
  const max = Math.max(1, ...summary.distribution);
  return (
    <section aria-label="My rating" data-testid="rating-card" className="rounded-2xl bg-paper p-4 ring-1 ring-line">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="font-display text-base font-semibold text-forest-900">কাস্টমারের রেটিং</h2>
          <p className="text-[11px] text-ink-soft">{summary.count}টি ডেলিভারি রেট হয়েছে</p>
        </div>
        <p className="font-display text-3xl font-bold text-forest-900" data-testid="rating-avg">
          ⭐ {summary.avg.toFixed(1)}
        </p>
      </div>

      <ul className="mt-3 space-y-1">
        {[5, 4, 3, 2, 1].map((star) => {
          const n = summary.distribution[star - 1];
          return (
            <li key={star} className="flex items-center gap-2 text-[11px]" data-testid={`rating-row-${star}`}>
              <span className="w-6 text-ink-soft">{star}★</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-line/60">
                <span className="block h-full rounded-full bg-gold-400" style={{ width: `${(n / max) * 100}%` }} />
              </span>
              <span className="w-6 text-right font-semibold text-forest-900">{n}</span>
            </li>
          );
        })}
      </ul>

      {summary.last30.count > 0 && (
        <p className="mt-3 text-xs text-ink" data-testid="rating-30d">
          গত ৩০ দিনে: ⭐ {summary.last30.avg.toFixed(1)} ({summary.last30.count}টি)
        </p>
      )}

      {summary.low.length > 0 && (
        <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs ring-1 ring-rose-200" data-testid="rating-low">
          <p className="font-semibold text-rose-900">কম রেটিং পাওয়া সাম্প্রতিক ডেলিভারি</p>
          <ul className="mt-1 space-y-0.5 text-rose-900">
            {summary.low.map((l, i) => (
              <li key={`${l.at}-${i}`}>
                {l.stars}★ · {l.orderNo ? `অর্ডার ${l.orderNo}` : "অর্ডার"} · {fmtDay(l.at)}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-rose-800">সময়মতো পৌঁছানো ও কাস্টমারকে আগে কল করলে রেটিং ভালো থাকে।</p>
        </div>
      )}
    </section>
  );
}
