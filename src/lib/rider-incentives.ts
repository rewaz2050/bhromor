/**
 * V (2026-10-02) — rider incentives, the pure half (202610020010).
 *
 * Two bonuses, both OFF until staff set an amount, both paid through the
 * wallet journal as `incentive` rows by the sweep (`ps_award_incentives`):
 *   • daily target — reach N deliveries in one Dhaka day → a bonus;
 *   • referral     — the rider you referred completes N deliveries → a bonus.
 *
 * The settings are flat `site_settings` keys because the SQL sweep reads them
 * with `ps_setting_int`; the bounds mirror the clamps inside that function.
 */

export const INCENTIVE_KEYS = {
  dailyTarget: "incentive_daily_target",
  dailyBonus: "incentive_daily_bonus_paisa",
  referralBonus: "incentive_referral_bonus_paisa",
  referralAfter: "incentive_referral_after",
} as const;

export interface IncentiveSettings {
  /** Deliveries in one Dhaka day. 0 = daily bonus off. */
  dailyTarget: number;
  /** Paisa. */
  dailyBonus: number;
  /** Paisa paid to the referrer. 0 = referral bonus off. */
  referralBonus: number;
  /** Deliveries the referred rider must complete first. */
  referralAfter: number;
}

export const INCENTIVE_DEFAULTS: IncentiveSettings = {
  dailyTarget: 0,
  dailyBonus: 0,
  referralBonus: 0,
  referralAfter: 10,
};

export const INCENTIVE_BOUNDS = {
  dailyTarget: { min: 0, max: 100 },
  bonusPaisa: { min: 0, max: 500_000 },
  referralAfter: { min: 1, max: 200 },
} as const;

export const dailyBonusOn = (s: IncentiveSettings): boolean => s.dailyTarget > 0 && s.dailyBonus > 0;
export const referralBonusOn = (s: IncentiveSettings): boolean => s.referralBonus > 0;
export const anyIncentiveOn = (s: IncentiveSettings): boolean => dailyBonusOn(s) || referralBonusOn(s);

const num = (raw: unknown): number => {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "") return Number(raw);
  return Number.NaN;
};

const clampInt = (raw: unknown, min: number, max: number, fallback: number): number => {
  const n = num(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};

/** Lenient: each unusable field falls back to its default, a stray value is clamped. */
export const sanitizeIncentiveSettings = (raw: Partial<Record<keyof IncentiveSettings, unknown>> | null | undefined): IncentiveSettings => ({
  dailyTarget: clampInt(raw?.dailyTarget, INCENTIVE_BOUNDS.dailyTarget.min, INCENTIVE_BOUNDS.dailyTarget.max, INCENTIVE_DEFAULTS.dailyTarget),
  dailyBonus: clampInt(raw?.dailyBonus, INCENTIVE_BOUNDS.bonusPaisa.min, INCENTIVE_BOUNDS.bonusPaisa.max, INCENTIVE_DEFAULTS.dailyBonus),
  referralBonus: clampInt(raw?.referralBonus, INCENTIVE_BOUNDS.bonusPaisa.min, INCENTIVE_BOUNDS.bonusPaisa.max, INCENTIVE_DEFAULTS.referralBonus),
  referralAfter: clampInt(raw?.referralAfter, INCENTIVE_BOUNDS.referralAfter.min, INCENTIVE_BOUNDS.referralAfter.max, INCENTIVE_DEFAULTS.referralAfter),
});

const taka = (raw: unknown): number => Math.round(num(raw) * 100);

/**
 * Strict read for writes. The form speaks taka; storage is paisa. Every field
 * must be a whole number inside its range, and a bonus needs its trigger (and
 * vice versa) — half a configuration would silently pay nothing.
 */
export const parseIncentiveInput = (
  raw: unknown,
): { ok: true; settings: IncentiveSettings } | { ok: false; error: string } => {
  const p = (raw ?? {}) as Record<string, unknown>;
  const target = num(p.dailyTarget);
  if (!Number.isInteger(target) || target < INCENTIVE_BOUNDS.dailyTarget.min || target > INCENTIVE_BOUNDS.dailyTarget.max) {
    return { ok: false, error: `Daily target must be a whole number of deliveries between ${INCENTIVE_BOUNDS.dailyTarget.min} and ${INCENTIVE_BOUNDS.dailyTarget.max} (0 = off).` };
  }
  const maxTaka = INCENTIVE_BOUNDS.bonusPaisa.max / 100;
  const dailyBonus = taka(p.dailyBonusTaka);
  if (!Number.isFinite(dailyBonus) || dailyBonus < 0 || dailyBonus > INCENTIVE_BOUNDS.bonusPaisa.max) {
    return { ok: false, error: `Daily bonus must be between ৳0 and ৳${maxTaka}.` };
  }
  const referralBonus = taka(p.referralBonusTaka);
  if (!Number.isFinite(referralBonus) || referralBonus < 0 || referralBonus > INCENTIVE_BOUNDS.bonusPaisa.max) {
    return { ok: false, error: `Referral bonus must be between ৳0 and ৳${maxTaka}.` };
  }
  const after = num(p.referralAfter);
  if (!Number.isInteger(after) || after < INCENTIVE_BOUNDS.referralAfter.min || after > INCENTIVE_BOUNDS.referralAfter.max) {
    return { ok: false, error: `Referral deliveries must be a whole number between ${INCENTIVE_BOUNDS.referralAfter.min} and ${INCENTIVE_BOUNDS.referralAfter.max}.` };
  }
  if ((target > 0) !== (dailyBonus > 0)) {
    return { ok: false, error: "Set both the daily target and its bonus, or leave both at 0." };
  }
  return { ok: true, settings: { dailyTarget: target, dailyBonus, referralBonus, referralAfter: after } };
};

/** What a rider typed into the "referral code" box → the canonical code, or "" when it cannot be one. */
export const normalizeReferralCode = (raw: unknown): string => {
  if (typeof raw !== "string") return "";
  const code = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return code.length >= 4 && code.length <= 12 ? code : "";
};

export type ReferralOutcome = "registered" | "unknown" | "self" | "already" | "not_new";

export const referralOutcomeMessage = (o: ReferralOutcome | "none"): string | null => {
  switch (o) {
    case "registered":
      return "রেফারেল কোড গ্রহণ করা হয়েছে।";
    case "none":
      return null;
    default:
      return "রেফারেল কোডটি মেলেনি — আবেদন ঠিকই জমা হয়েছে।";
  }
};

export interface IncentiveAward {
  riderId: string;
  kind: "daily_target" | "referral";
  /** Paisa. */
  amount: number;
  note: string;
}

const bdt = (paisa: number): string => `৳${(paisa / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** The push the rider gets when a bonus lands in their wallet. */
export const awardMessage = (a: Pick<IncentiveAward, "kind" | "amount">): { title: string; body: string } =>
  a.kind === "daily_target"
    ? { title: "🎯 আজকের টার্গেট পূর্ণ!", body: `${bdt(a.amount)} বোনাস আপনার ওয়ালেটে যোগ হয়েছে।` }
    : { title: "🤝 রেফারেল বোনাস!", body: `আপনার রেফার করা রাইডার লক্ষ্যে পৌঁছেছে — ${bdt(a.amount)} ওয়ালেটে যোগ হয়েছে।` };

export interface DailyProgress {
  done: number;
  target: number;
  left: number;
  reached: boolean;
  /** 0–100 */
  percent: number;
}

export const dailyProgress = (done: number, target: number): DailyProgress => {
  const t = Math.max(0, Math.floor(target));
  const d = Math.max(0, Math.floor(done));
  return {
    done: d,
    target: t,
    left: Math.max(0, t - d),
    reached: t > 0 && d >= t,
    percent: t > 0 ? Math.min(100, Math.round((d / t) * 100)) : 0,
  };
};

/** Shown to the rider, who shares it with a friend. */
export const referralShareText = (code: string, bonus: number, after: number): string =>
  `PROSANTI-তে রাইডার হিসেবে কাজ করুন! আবেদনের সময় আমার রেফারেল কোড ${code} দিন` +
  (bonus > 0 ? ` — ${after}টি ডেলিভারি শেষ হলে আমি ${bdt(bonus)} বোনাস পাব।` : ".");

export interface RiderIncentiveView {
  settings: IncentiveSettings;
  today: DailyProgress | null;
  /** Bonuses already paid for today's Dhaka day. */
  todayPaid: boolean;
  referral: {
    code: string;
    after: number;
    bonus: number;
    items: { name: string; done: number; rewarded: boolean }[];
    totalEarned: number;
  };
  totalEarned: number;
}
