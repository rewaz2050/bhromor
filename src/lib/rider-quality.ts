/**
 * Item M — rider scorecards. Pure and client-safe.
 *
 * The database returns FACTS (`ps_rider_scorecards_raw`, migration
 * 202610020006); every threshold lives here so it is unit-tested and easy to
 * tune. Two outputs:
 *   • assessScorecard — a 0–100 score, a grade and human flags for the board;
 *   • autoSuspendReason — the HARD rules the (opt-in, default OFF) scheduler
 *     sweep may act on. They are deliberately far stricter than the board's
 *     "watch" flags: a rider is suspended only for clear, repeated, or
 *     money-at-risk behaviour, never for one bad day.
 */

export interface Scorecard {
  id: string;
  name: string;
  vehicle: string;
  isOnline: boolean;
  ratingAvg: number;
  ratingCount: number;
  cashInHand: number;
  currentLoad: number;
  createdAt: number;
  pendingClaim: boolean;
  lastSettledAt: number | null;
  oldestCodAt: number | null;
  offered: number;
  delivered: number;
  failed: number;
  declined: number;
  expired: number;
  avgDeliveryMinutes: number | null;
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const ts = (v: unknown): number | null => {
  if (typeof v !== "string" || !v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

export const normalizeScorecards = (raw: unknown): Scorecard[] => {
  if (!Array.isArray(raw)) return [];
  const out: Scorecard[] = [];
  for (const item of raw) {
    const r = obj(item);
    if (typeof r.id !== "string" || !r.id) continue;
    out.push({
      id: r.id,
      name: typeof r.name === "string" ? r.name : "",
      vehicle: typeof r.vehicle === "string" ? r.vehicle : "",
      isOnline: r.isOnline === true,
      ratingAvg: num(r.ratingAvg),
      ratingCount: num(r.ratingCount),
      cashInHand: num(r.cashInHand),
      currentLoad: num(r.currentLoad),
      createdAt: ts(r.createdAt) ?? 0,
      pendingClaim: r.pendingClaim === true,
      lastSettledAt: ts(r.lastSettledAt),
      oldestCodAt: ts(r.oldestCodAt),
      offered: num(r.offered),
      delivered: num(r.delivered),
      failed: num(r.failed),
      declined: num(r.declined),
      expired: num(r.expired),
      avgDeliveryMinutes: r.avgDeliveryMinutes == null ? null : num(r.avgDeliveryMinutes),
    });
  }
  return out;
};

export const QUALITY = {
  /** Minimum samples before a rate is trusted at all. */
  minAttempts: 4,
  minOffers: 5,
  minRatings: 3,
  /** Score weights (re-normalised over the parts that have data). */
  weight: { reliability: 50, responsiveness: 25, rating: 25 },
  failRateWatch: 0.25,
  acceptWatch: 0.5,
  ratingWatch: 3.5,
  codWatchHours: 24,
  codHighHours: 48,
  gradeA: 85,
  gradeB: 70,
  gradeC: 55,
} as const;

/** The only conditions the scheduler may suspend on (when staff switch it on). */
export const AUTO_SUSPEND = {
  /** Unsettled COD this old, with no claim waiting for staff. */
  codOverdueHours: 96,
  /** At least this many closed jobs in the window … */
  minAttempts: 8,
  /** … and at least this share of them failed. */
  failRate: 0.5,
  minRatings: 10,
  /** Lifetime average below this, with enough ratings. */
  ratingBelow: 2,
} as const;

export type Grade = "A" | "B" | "C" | "D" | "new";

export interface QualityFlag {
  level: "watch" | "high";
  code: "fail-rate" | "low-accept" | "low-rating" | "cod-old" | "cash-capped" | "auto-suspend";
  text: string;
}

export interface Assessment {
  /** null while there is not enough history to judge. */
  score: number | null;
  grade: Grade;
  /** delivered / (delivered + failed), null under the sample minimum. */
  successRate: number | null;
  /** 1 − (declined + expired) / offered, null under the sample minimum. */
  acceptRate: number | null;
  flags: QualityFlag[];
}

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export const autoSuspendReason = (c: Scorecard, now: number = Date.now()): string | null => {
  const A = AUTO_SUSPEND;
  if (c.cashInHand > 0 && c.oldestCodAt !== null && !c.pendingClaim) {
    const hours = (now - c.oldestCodAt) / 3_600_000;
    if (hours >= A.codOverdueHours) {
      return `COD cash unsettled for ${Math.floor(hours / 24)}+ days with no pay-in claim`;
    }
  }
  const closed = c.delivered + c.failed;
  if (closed >= A.minAttempts && c.failed / closed >= A.failRate) {
    return `${c.failed} of ${closed} recent deliveries failed (${pct(c.failed / closed)})`;
  }
  if (c.ratingCount >= A.minRatings && c.ratingAvg > 0 && c.ratingAvg < A.ratingBelow) {
    return `Customer rating ${c.ratingAvg.toFixed(1)} from ${c.ratingCount} ratings`;
  }
  return null;
};

export const assessScorecard = (c: Scorecard, cashCap: number, now: number = Date.now()): Assessment => {
  const Q = QUALITY;
  const flags: QualityFlag[] = [];
  const closed = c.delivered + c.failed;
  const successRate = closed >= Q.minAttempts ? c.delivered / closed : null;
  const acceptRate = c.offered >= Q.minOffers ? 1 - (c.declined + c.expired) / c.offered : null;
  const hasRating = c.ratingCount >= Q.minRatings && c.ratingAvg > 0;

  const parts: { w: number; v: number }[] = [];
  if (successRate !== null) parts.push({ w: Q.weight.reliability, v: successRate });
  if (acceptRate !== null) parts.push({ w: Q.weight.responsiveness, v: clamp(acceptRate, 0, 1) });
  if (hasRating) parts.push({ w: Q.weight.rating, v: clamp(c.ratingAvg / 5, 0, 1) });

  if (successRate !== null && 1 - successRate >= Q.failRateWatch) {
    flags.push({ level: "watch", code: "fail-rate", text: `${pct(1 - successRate)} deliveries failed (${c.failed} of ${closed})` });
  }
  if (acceptRate !== null && acceptRate < Q.acceptWatch) {
    flags.push({ level: "watch", code: "low-accept", text: `Takes only ${pct(acceptRate)} of offers (${c.declined} declined, ${c.expired} timed out)` });
  }
  if (hasRating && c.ratingAvg < Q.ratingWatch) {
    flags.push({ level: "watch", code: "low-rating", text: `Rating ${c.ratingAvg.toFixed(1)} from ${c.ratingCount}` });
  }

  let penalty = 0;
  if (c.cashInHand > 0 && c.oldestCodAt !== null) {
    const hours = Math.max(0, (now - c.oldestCodAt) / 3_600_000);
    if (hours >= Q.codHighHours) {
      penalty += 15;
      flags.push({ level: "high", code: "cod-old", text: `COD cash held ${Math.floor(hours / 24)}+ days` });
    } else if (hours >= Q.codWatchHours) {
      penalty += 5;
      flags.push({ level: "watch", code: "cod-old", text: `COD cash held ${Math.floor(hours)} h` });
    }
  }
  if (cashCap > 0 && c.cashInHand >= cashCap) {
    penalty += 10;
    flags.push({ level: "high", code: "cash-capped", text: "At the cash limit — receives no offers" });
  }

  const auto = autoSuspendReason(c, now);
  if (auto) flags.push({ level: "high", code: "auto-suspend", text: `Meets auto-suspend rule: ${auto}` });

  let score: number | null = null;
  if (parts.length > 0) {
    const totalW = parts.reduce((s, p) => s + p.w, 0);
    const base = (parts.reduce((s, p) => s + p.w * p.v, 0) / totalW) * 100;
    score = Math.round(clamp(base - penalty, 0, 100));
  }
  const grade: Grade =
    score === null ? "new" : score >= Q.gradeA ? "A" : score >= Q.gradeB ? "B" : score >= Q.gradeC ? "C" : "D";
  return { score, grade, successRate, acceptRate, flags };
};

export interface RankedCard {
  card: Scorecard;
  assessment: Assessment;
}

/** Worst first (needs attention at the top); unscored riders last. */
export const rankScorecards = (cards: Scorecard[], cashCap: number, now: number = Date.now()): RankedCard[] =>
  cards
    .map((card) => ({ card, assessment: assessScorecard(card, cashCap, now) }))
    .sort((a, b) => {
      const sa = a.assessment.score;
      const sb = b.assessment.score;
      if (sa === null && sb === null) return a.card.name.localeCompare(b.card.name);
      if (sa === null) return 1;
      if (sb === null) return -1;
      return sa - sb || a.card.name.localeCompare(b.card.name);
    });

export const AUTO_SUSPEND_KEY = "rider_auto_suspend";

/** `site_settings.value` is jsonb: accept true / "true" / 1. Anything else is OFF. */
export const parseAutoSuspend = (raw: unknown): boolean => raw === true || raw === "true" || raw === 1;
