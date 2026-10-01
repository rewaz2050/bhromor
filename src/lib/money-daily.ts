/**
 * Daily money reconciliation (202610010007, audit item U) — the pure half:
 * the report shape, Dhaka-day helpers, check labels and the plain-text summary
 * an owner can paste into WhatsApp.
 */

export interface DailyFlows {
  deliveredOrders: number;
  returnLegs: number;
  orderValue: number;
  codCollectedByRiders: number;
  walletPaidOrders: number;
  commission: number;
  deliveryIncome: number;
  shopPayableAccrued: number;
  shopPayoutsPaid: number;
  riderEarned: number;
  riderAdjustments: number;
  riderPayoutsRequested: number;
  riderPayoutsPaid: number;
  settlementsCount: number;
  settlementsTotal: number;
  settlementsNetted: number;
  cashHandedIn: number;
}

export interface DailyPosition {
  codCustody: number;
  riderPayable: number;
  shopPayable: number;
}

export const DAILY_CHECK_KEYS = [
  "wallet_journal",
  "negative_cash",
  "shop_overpaid",
  "delivered_no_ledger",
  "stale_payouts",
  "stale_claims",
  "open_failed_deliveries",
  "stale_payment_verification",
] as const;
export type DailyCheckKey = (typeof DAILY_CHECK_KEYS)[number];

export interface DailyCheck {
  key: DailyCheckKey;
  ok: boolean;
  count: number;
  sample: string[];
}

export interface MoneyDaily {
  day: string;
  flows: DailyFlows;
  position: DailyPosition;
  checks: DailyCheck[];
}

/** What each check means, in words the owner can act on. */
export const DAILY_CHECK_LABEL: Record<DailyCheckKey, { title: string; fix: string }> = {
  wallet_journal: {
    title: "Rider wallets match their journal",
    fix: "A rider's wallet balance differs from the sum of their earnings lines — do not pay them until it is explained.",
  },
  negative_cash: {
    title: "No rider holds negative cash",
    fix: "A rider's cash-in-hand is below zero — a settlement or release was recorded twice.",
  },
  shop_overpaid: {
    title: "No shop paid more than it earned",
    fix: "Payouts to a shop exceed its ledger — check the shop's payout history.",
  },
  delivered_no_ledger: {
    title: "Every delivered order has its shop ledger line",
    fix: "A delivered order produced no shop payable — the shop would never be paid for it.",
  },
  stale_payouts: {
    title: "No rider payout waiting over 48 hours",
    fix: "Riders are waiting for their withdrawal — open the payout queue.",
  },
  stale_claims: {
    title: "No settle claim waiting over 48 hours",
    fix: "A rider says they paid in cash — approve or reject the claim.",
  },
  open_failed_deliveries: {
    title: "No failed delivery left unresolved",
    fix: "A parcel is stuck after failed attempts — redispatch or cancel it on the Deliveries board.",
  },
  stale_payment_verification: {
    title: "No bKash/Nagad payment undecided over a day",
    fix: "A customer paid and is waiting — verify or reject the payment.",
  },
};

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Today's calendar date in Dhaka (UTC+6, no DST) as YYYY-MM-DD. */
export const todayDhaka = (now: number = Date.now()): string =>
  new Date(now + 6 * 3_600_000).toISOString().slice(0, 10);

/** A real calendar day, not in the future; anything else → today. */
export const parseDay = (raw: string | null | undefined, now: number = Date.now()): string => {
  const today = todayDhaka(now);
  const m = DAY_RE.exec((raw ?? "").trim());
  if (!m) return today;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return today;
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  return day > today ? today : day;
};

export const shiftDay = (day: string, delta: number): string => {
  const m = DAY_RE.exec(day);
  if (!m) return day;
  const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) + delta * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
};

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const FLOW_KEYS: (keyof DailyFlows)[] = [
  "deliveredOrders", "returnLegs", "orderValue", "codCollectedByRiders", "walletPaidOrders", "commission",
  "deliveryIncome", "shopPayableAccrued", "shopPayoutsPaid", "riderEarned", "riderAdjustments",
  "riderPayoutsRequested", "riderPayoutsPaid", "settlementsCount", "settlementsTotal", "settlementsNetted",
  "cashHandedIn",
];

/** Normalise the RPC's jsonb (bigint-as-string safe, missing keys → 0). */
export const normalizeDaily = (raw: unknown): MoneyDaily => {
  const r = (raw ?? {}) as Record<string, unknown>;
  const f = (r.flows ?? {}) as Record<string, unknown>;
  const p = (r.position ?? {}) as Record<string, unknown>;
  const checks = Array.isArray(r.checks) ? (r.checks as Record<string, unknown>[]) : [];
  return {
    day: typeof r.day === "string" ? r.day : todayDhaka(),
    flows: Object.fromEntries(FLOW_KEYS.map((k) => [k, num(f[k])])) as unknown as DailyFlows,
    position: { codCustody: num(p.codCustody), riderPayable: num(p.riderPayable), shopPayable: num(p.shopPayable) },
    checks: DAILY_CHECK_KEYS.map((key) => {
      const c = checks.find((x) => x.key === key);
      // A check the database did not return is NOT reported as passing.
      return {
        key,
        ok: c ? c.ok === true : false,
        count: c ? num(c.count) : 0,
        sample: Array.isArray(c?.sample) ? (c!.sample as unknown[]).map(String) : [],
      };
    }),
  };
};

const taka = (paisa: number): string => `৳${(Math.round(paisa) / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** The report as plain text, ready to paste into a chat. */
export const dailyToText = (d: MoneyDaily): string => {
  const f = d.flows;
  const failed = d.checks.filter((c) => !c.ok);
  return [
    `PROSANTI money — ${d.day}`,
    `Delivered ${f.deliveredOrders} orders (${taka(f.orderValue)})${f.returnLegs ? ` + ${f.returnLegs} return legs` : ""}`,
    `COD collected by riders ${taka(f.codCollectedByRiders)} · wallet-paid ${taka(f.walletPaidOrders)}`,
    `Riders handed in ${taka(f.cashHandedIn)} cash` +
      (f.settlementsNetted > 0 ? ` (+${taka(f.settlementsNetted)} netted from wallets)` : "") +
      ` in ${f.settlementsCount} settlement(s)`,
    `Commission ${taka(f.commission)} · delivery income ${taka(f.deliveryIncome)}`,
    `Rider earned ${taka(f.riderEarned)} · rider payouts paid ${taka(f.riderPayoutsPaid)} · shop payouts paid ${taka(f.shopPayoutsPaid)}`,
    `Position now: riders hold ${taka(d.position.codCustody)} · owe riders ${taka(d.position.riderPayable)} · owe shops ${taka(d.position.shopPayable)}`,
    failed.length === 0
      ? "Checks: all clear ✅"
      : `Checks: ${failed.length} need attention ⚠️ — ${failed.map((c) => `${DAILY_CHECK_LABEL[c.key].title} (${c.count})`).join("; ")}`,
  ].join("\n");
};
