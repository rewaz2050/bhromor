/**
 * Admin rider profile (202610020002): the typed overview and the COD-risk
 * rules. The database returns FACTS; every threshold lives here so it is
 * unit-tested and easy to tune.
 */

import { DISPATCH_DEFAULTS } from "./dispatch-settings";

export type RiskLevel = "ok" | "watch" | "high";

export interface RiderOverview {
  rider: {
    id: string;
    name: string;
    phone: string;
    status: string;
    vehicle: string;
    isOnline: boolean;
    zoneIds: string[];
    ratingAvg: number;
    ratingCount: number;
    totalDeliveries: number;
    createdAt: number;
  };
  money: {
    cashInHand: number;
    earningsBalance: number;
    lifetimeEarned: number;
    paidOut: number;
    pendingPayout: number;
    nettedAgainstCash: number;
    handedIn: number;
  };
  risk: {
    cashInHand: number;
    cashLimit: number;
    codCountSinceSettle: number;
    codValueSinceSettle: number;
    oldestCodAt: number | null;
    lastSettledAt: number | null;
    pendingClaim: { id: string; amount: number; method: string; reference: string; at: number } | null;
    rejectedClaims30: number;
  };
  performance: {
    offered30: number;
    delivered30: number;
    failed30: number;
    declined30: number;
    expired30: number;
    delivered7: number;
    avgDeliveryMinutes: number | null;
  };
  journal: { id: string; kind: string; amount: number; note: string; at: number; orderNo: string | null }[];
  payouts: { id: string; amount: number; method: string; account: string; status: string; at: number; decidedAt: number | null; note: string | null; reference: string }[];
  settlements: { id: string; amount: number; nettedAmount: number; method: string; reference: string; at: number }[];
  claims: { id: string; amount: number; method: string; reference: string; status: string; at: number; decidedAt: number | null; note: string | null }[];
  trips: { id: string; orderNo: string; state: "delivered" | "failed"; at: number; area: string; total: number; payment: string; isReturn: boolean; shop: string; failedReason: string | null }[];
}

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? v.map(obj) : []);
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const ts = (v: unknown): number | null => {
  if (typeof v !== "string" || !v) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export const normalizeOverview = (raw: unknown): RiderOverview | null => {
  const r = obj(raw);
  const rider = obj(r.rider);
  if (!str(rider.id)) return null;
  const money = obj(r.money);
  const risk = obj(r.risk);
  const perf = obj(r.performance);
  const claim = r.risk && obj(risk.pendingClaim).id ? obj(risk.pendingClaim) : null;
  return {
    rider: {
      id: str(rider.id),
      name: str(rider.name),
      phone: str(rider.phone),
      status: str(rider.status),
      vehicle: str(rider.vehicle),
      isOnline: rider.isOnline === true,
      zoneIds: Array.isArray(rider.zoneIds) ? rider.zoneIds.filter((z): z is string => typeof z === "string") : [],
      ratingAvg: num(rider.ratingAvg),
      ratingCount: num(rider.ratingCount),
      totalDeliveries: num(rider.totalDeliveries),
      createdAt: ts(rider.createdAt) ?? 0,
    },
    money: {
      cashInHand: num(money.cashInHand),
      earningsBalance: num(money.earningsBalance),
      lifetimeEarned: num(money.lifetimeEarned),
      paidOut: num(money.paidOut),
      pendingPayout: num(money.pendingPayout),
      nettedAgainstCash: num(money.nettedAgainstCash),
      handedIn: num(money.handedIn),
    },
    risk: {
      cashInHand: num(risk.cashInHand),
      cashLimit: num(risk.cashLimit) || DISPATCH_DEFAULTS.cashCap,
      codCountSinceSettle: num(risk.codCountSinceSettle),
      codValueSinceSettle: num(risk.codValueSinceSettle),
      oldestCodAt: ts(risk.oldestCodAt),
      lastSettledAt: ts(risk.lastSettledAt),
      pendingClaim: claim
        ? { id: str(claim.id), amount: num(claim.amount), method: str(claim.method), reference: str(claim.reference), at: ts(claim.at) ?? 0 }
        : null,
      rejectedClaims30: num(risk.rejectedClaims30),
    },
    performance: {
      offered30: num(perf.offered30),
      delivered30: num(perf.delivered30),
      failed30: num(perf.failed30),
      declined30: num(perf.declined30),
      expired30: num(perf.expired30),
      delivered7: num(perf.delivered7),
      avgDeliveryMinutes: perf.avgDeliveryMinutes == null ? null : num(perf.avgDeliveryMinutes),
    },
    journal: arr(r.journal).map((j) => ({ id: str(j.id), kind: str(j.kind), amount: num(j.amount), note: str(j.note), at: ts(j.at) ?? 0, orderNo: strOrNull(j.orderNo) })),
    payouts: arr(r.payouts).map((p) => ({
      id: str(p.id), amount: num(p.amount), method: str(p.method), account: str(p.account), status: str(p.status),
      at: ts(p.at) ?? 0, decidedAt: ts(p.decidedAt), note: strOrNull(p.note), reference: str(p.reference),
    })),
    settlements: arr(r.settlements).map((s) => ({ id: str(s.id), amount: num(s.amount), nettedAmount: num(s.nettedAmount), method: str(s.method), reference: str(s.reference), at: ts(s.at) ?? 0 })),
    claims: arr(r.claims).map((c) => ({
      id: str(c.id), amount: num(c.amount), method: str(c.method), reference: str(c.reference), status: str(c.status),
      at: ts(c.at) ?? 0, decidedAt: ts(c.decidedAt), note: strOrNull(c.note),
    })),
    trips: arr(r.trips).map((t) => ({
      id: str(t.id), orderNo: str(t.orderNo), state: t.state === "failed" ? "failed" : "delivered", at: ts(t.at) ?? 0,
      area: str(t.area), total: num(t.total), payment: str(t.payment) || "cod", isReturn: t.isReturn === true,
      shop: str(t.shop), failedReason: strOrNull(t.failedReason),
    })),
  };
};

export interface RiskReason {
  level: Exclude<RiskLevel, "ok">;
  text: string;
}

export interface RiskAssessment {
  level: RiskLevel;
  reasons: RiskReason[];
  /** cash in hand as a percentage of the dispatch cap (0–100+). */
  cashPct: number;
  /** hours the oldest unsettled COD parcel has been with the rider, or null. */
  oldestCodHours: number | null;
}

export const RISK_THRESHOLDS = {
  cashHighPct: 80,
  cashWatchPct: 50,
  oldestHighHours: 48,
  oldestWatchHours: 24,
  staleClaimHours: 48,
  rejectedClaimsWatch: 2,
  failRateWatch: 0.25,
  minAttemptsForRate: 4,
  expiredWatch: 5,
} as const;

export const assessRisk = (o: RiderOverview, now: number = Date.now()): RiskAssessment => {
  const T = RISK_THRESHOLDS;
  const reasons: RiskReason[] = [];
  const cash = o.risk.cashInHand;
  const cashPct = o.risk.cashLimit > 0 ? Math.round((cash / o.risk.cashLimit) * 100) : 0;
  const oldestCodHours =
    cash > 0 && o.risk.oldestCodAt !== null ? Math.max(0, (now - o.risk.oldestCodAt) / 3_600_000) : null;

  if (cashPct >= 100) reasons.push({ level: "high", text: "ক্যাশ লিমিটে পৌঁছেছে — নতুন অর্ডার দেওয়া বন্ধ" });
  else if (cashPct >= T.cashHighPct) reasons.push({ level: "high", text: `ক্যাশ লিমিটের ${cashPct}% হাতে আছে` });
  else if (cashPct >= T.cashWatchPct) reasons.push({ level: "watch", text: `ক্যাশ লিমিটের ${cashPct}% হাতে আছে` });

  if (oldestCodHours !== null) {
    const days = Math.floor(oldestCodHours / 24);
    const label = oldestCodHours >= 24 ? `${days} দিনের বেশি` : `${Math.floor(oldestCodHours)} ঘণ্টা`;
    if (oldestCodHours >= T.oldestHighHours) reasons.push({ level: "high", text: `সবচেয়ে পুরনো COD টাকা ${label} ধরে জমা হয়নি` });
    else if (oldestCodHours >= T.oldestWatchHours) reasons.push({ level: "watch", text: `সবচেয়ে পুরনো COD টাকা ${label} ধরে জমা হয়নি` });
  }

  if (o.risk.pendingClaim && now - o.risk.pendingClaim.at >= T.staleClaimHours * 3_600_000) {
    reasons.push({ level: "watch", text: "জমার দাবি ৪৮ ঘণ্টার বেশি অপেক্ষায় — অফিসের সিদ্ধান্ত বাকি" });
  }
  if (o.risk.rejectedClaims30 >= T.rejectedClaimsWatch) {
    reasons.push({ level: "watch", text: `গত ৩০ দিনে ${o.risk.rejectedClaims30}টি জমার দাবি বাতিল হয়েছে` });
  }

  const p = o.performance;
  const finished = p.delivered30 + p.failed30;
  if (finished >= T.minAttemptsForRate && p.failed30 / finished >= T.failRateWatch) {
    reasons.push({ level: "watch", text: `গত ৩০ দিনে ${p.failed30}/${finished} ডেলিভারি ব্যর্থ` });
  }
  if (p.expired30 >= T.expiredWatch) {
    reasons.push({ level: "watch", text: `গত ৩০ দিনে ${p.expired30}টি অফার উপেক্ষা (মেয়াদ শেষ)` });
  }

  const level: RiskLevel = reasons.some((r) => r.level === "high") ? "high" : reasons.length > 0 ? "watch" : "ok";
  return { level, reasons, cashPct, oldestCodHours };
};
