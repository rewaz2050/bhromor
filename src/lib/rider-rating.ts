/**
 * The rider's own rating picture: how the stars are spread, the last 30 days
 * versus lifetime, and the recent low-star orders (by order number — the
 * customer stays anonymous) so a rider can see WHICH delivery went wrong.
 */

export interface RatingRow {
  stars: number;
  at: number;
  orderNo?: string;
}

export interface RatingSummary<T extends RatingRow = RatingRow> {
  count: number;
  avg: number;
  /** Index 0 = 1 star … index 4 = 5 stars. */
  distribution: [number, number, number, number, number];
  last30: { count: number; avg: number };
  /** Newest-first deliveries rated 1–2 stars (max 5). */
  low: T[];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

export const summarizeRatings = <T extends RatingRow>(rows: readonly T[], now: number = Date.now()): RatingSummary<T> => {
  const valid = rows.filter((r) => Number.isInteger(r.stars) && r.stars >= 1 && r.stars <= 5);
  const distribution: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  for (const r of valid) distribution[r.stars - 1] += 1;
  const sum = (xs: readonly T[]): number => xs.reduce((n, r) => n + r.stars, 0);
  const recent = valid.filter((r) => r.at >= now - 30 * 86_400_000);
  return {
    count: valid.length,
    avg: valid.length ? round1(sum(valid) / valid.length) : 0,
    distribution,
    last30: { count: recent.length, avg: recent.length ? round1(sum(recent) / recent.length) : 0 },
    low: valid
      .filter((r) => r.stars <= 2)
      .sort((a, b) => b.at - a.at)
      .slice(0, 5),
  };
};
