/**
 * Peak-hour and rainy-day delivery bonus — the pure half (202610020015).
 *
 * Two flat per-order bonuses plus a weekly streak bonus (202610020017), all OFF until staff set an amount, paid into the
 * wallet journal as `incentive` rows by the sweep (`ps_award_order_bonuses`):
 *   • peak  — an order delivered inside the peak window (Dhaka clock) earns a bonus;
 *   • rain  — an order the CUSTOMER paid the rain surcharge on earns a bonus;
 *   • streak — the rider reached the weekly tier-1 target in each of the last K complete weeks.
 * Peak and rain stack. Each is paid once per order. Settings are flat `site_settings` keys because
 * the SQL reads them with `ps_setting_int`; bounds mirror the clamps inside that function.
 */

export const ORDER_BONUS_KEYS = {
  peakBonus: "rider_peak_bonus_paisa",
  peakStartHour: "rider_peak_start_hour",
  peakEndHour: "rider_peak_end_hour",
  rainBonus: "rider_rain_bonus_paisa",
  streakWeeks: "rider_streak_weeks",
  streakBonus: "rider_streak_bonus_paisa",
} as const;

export interface OrderBonusSettings {
  /** Paisa per delivered order inside the window. 0 = off. */
  peakBonus: number;
  /** Dhaka hour 0–23, inclusive. */
  peakStartHour: number;
  /** Dhaka hour 0–23, exclusive. Start > end wraps midnight; start = end is no window. */
  peakEndHour: number;
  /** Paisa per delivered order that carried the rain surcharge. 0 = off. */
  rainBonus: number;
  /** Consecutive complete Mon–Sun weeks at the weekly tier-1 target. 0 = off, else 2–8. */
  streakWeeks: number;
  /** Paisa, paid once when the streak is reached. 0 = off. */
  streakBonus: number;
}

export const ORDER_BONUS_DEFAULTS: OrderBonusSettings = {
  peakBonus: 0,
  peakStartHour: 18,
  peakEndHour: 22,
  rainBonus: 0,
  streakWeeks: 0,
  streakBonus: 0,
};

export const ORDER_BONUS_BOUNDS = {
  bonusPaisa: { min: 0, max: 20_000 },
  hour: { min: 0, max: 23 },
  streakWeeks: { min: 2, max: 8 },
  streakBonusPaisa: { min: 0, max: 500_000 },
} as const;

export const peakBonusOn = (s: OrderBonusSettings): boolean => s.peakBonus > 0 && s.peakStartHour !== s.peakEndHour;
export const rainBonusOn = (s: OrderBonusSettings): boolean => s.rainBonus > 0;
export const streakBonusOn = (s: OrderBonusSettings): boolean => s.streakWeeks >= ORDER_BONUS_BOUNDS.streakWeeks.min && s.streakBonus > 0;
export const anyOrderBonusOn = (s: OrderBonusSettings): boolean => peakBonusOn(s) || rainBonusOn(s) || streakBonusOn(s);

/** Mirrors the SQL: start inclusive, end exclusive, start > end wraps midnight. */
export const inPeakWindow = (dhakaHour: number, s: Pick<OrderBonusSettings, "peakStartHour" | "peakEndHour">): boolean => {
  const h = Math.floor(dhakaHour);
  if (s.peakStartHour === s.peakEndHour) return false;
  return s.peakStartHour < s.peakEndHour ? h >= s.peakStartHour && h < s.peakEndHour : h >= s.peakStartHour || h < s.peakEndHour;
};

const num = (raw: unknown): number => {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "") return Number(raw);
  return Number.NaN;
};
const clampInt = (raw: unknown, min: number, max: number, fallback: number): number => {
  const n = num(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
};

/** Lenient read (database → app): each unusable field falls back to its default. */
export const sanitizeOrderBonusSettings = (raw: Partial<Record<keyof OrderBonusSettings, unknown>> | null | undefined): OrderBonusSettings => ({
  peakBonus: clampInt(raw?.peakBonus, 0, ORDER_BONUS_BOUNDS.bonusPaisa.max, ORDER_BONUS_DEFAULTS.peakBonus),
  peakStartHour: clampInt(raw?.peakStartHour, 0, 23, ORDER_BONUS_DEFAULTS.peakStartHour),
  peakEndHour: clampInt(raw?.peakEndHour, 0, 23, ORDER_BONUS_DEFAULTS.peakEndHour),
  rainBonus: clampInt(raw?.rainBonus, 0, ORDER_BONUS_BOUNDS.bonusPaisa.max, ORDER_BONUS_DEFAULTS.rainBonus),
  streakWeeks: clampInt(raw?.streakWeeks, 0, ORDER_BONUS_BOUNDS.streakWeeks.max, ORDER_BONUS_DEFAULTS.streakWeeks),
  streakBonus: clampInt(raw?.streakBonus, 0, ORDER_BONUS_BOUNDS.streakBonusPaisa.max, ORDER_BONUS_DEFAULTS.streakBonus),
});

/** Strict read for writes. The form speaks taka; storage is paisa. */
export const parseOrderBonusInput = (
  raw: unknown,
): { ok: true; settings: OrderBonusSettings } | { ok: false; error: string } => {
  const p = (raw ?? {}) as Record<string, unknown>;
  const maxTaka = ORDER_BONUS_BOUNDS.bonusPaisa.max / 100;
  const blank = (v: unknown): unknown => (v === undefined || v === null || v === "" ? 0 : v);
  const peak = Math.round(num(blank(p.peakBonusTaka)) * 100);
  const rain = Math.round(num(blank(p.rainBonusTaka)) * 100);
  for (const [n, label] of [[peak, "Peak-hour bonus"], [rain, "Rainy-day bonus"]] as const) {
    if (!Number.isFinite(n) || n < 0 || n > ORDER_BONUS_BOUNDS.bonusPaisa.max) {
      return { ok: false, error: `${label} must be between ৳0 and ৳${maxTaka} (0 = off).` };
    }
  }
  const startRaw = p.peakStartHour === undefined || p.peakStartHour === "" ? ORDER_BONUS_DEFAULTS.peakStartHour : num(p.peakStartHour);
  const endRaw = p.peakEndHour === undefined || p.peakEndHour === "" ? ORDER_BONUS_DEFAULTS.peakEndHour : num(p.peakEndHour);
  for (const [n, label] of [[startRaw, "Peak window start"], [endRaw, "Peak window end"]] as const) {
    if (!Number.isInteger(n) || n < 0 || n > 23) {
      return { ok: false, error: `${label} must be a whole hour between 0 and 23.` };
    }
  }
  if (peak > 0 && startRaw === endRaw) {
    return { ok: false, error: "The peak window needs different start and end hours (use 22 → 2 for overnight)." };
  }
  // The streak fields are optional so an older client that does not know them still saves
  // (the streak bonus then stays off).
  const weeks = num(blank(p.streakWeeks));
  const streak = Math.round(num(blank(p.streakBonusTaka)) * 100);
  const { min: wMin, max: wMax } = ORDER_BONUS_BOUNDS.streakWeeks;
  if (!Number.isInteger(weeks) || (weeks !== 0 && (weeks < wMin || weeks > wMax))) {
    return { ok: false, error: `Streak length must be 0 (off) or a whole number of weeks between ${wMin} and ${wMax}.` };
  }
  if (!Number.isFinite(streak) || streak < 0 || streak > ORDER_BONUS_BOUNDS.streakBonusPaisa.max) {
    return { ok: false, error: `Streak bonus must be between ৳0 and ৳${ORDER_BONUS_BOUNDS.streakBonusPaisa.max / 100}.` };
  }
  if ((weeks > 0) !== (streak > 0)) {
    return { ok: false, error: "Set both the streak length and its bonus, or leave both at 0." };
  }
  return {
    ok: true,
    settings: { peakBonus: peak, peakStartHour: startRaw, peakEndHour: endRaw, rainBonus: rain, streakWeeks: weeks, streakBonus: streak },
  };
};

export interface OrderBonusAward {
  riderId: string;
  kind: "peak_bonus" | "rain_bonus" | "streak_bonus";
  /** Paisa. */
  amount: number;
  note: string;
}

const bdt = (paisa: number): string => `৳${(paisa / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** One push per rider per kind per sweep — a busy hour must not buzz a phone ten times. */
export const orderBonusMessage = (kind: OrderBonusAward["kind"], count: number, total: number): { title: string; body: string } =>
  kind === "peak_bonus"
    ? { title: "⚡ পিক আওয়ার বোনাস!", body: `${count}টি ডেলিভারির জন্য ${bdt(total)} আপনার ওয়ালেটে যোগ হয়েছে।` }
    : kind === "streak_bonus"
    ? { title: "🔥 স্ট্রিক বোনাস!", body: `পরপর সপ্তাহে টার্গেট পূর্ণ করার জন্য ${bdt(total)} আপনার ওয়ালেটে যোগ হয়েছে।` }
    : { title: "🌧️ বৃষ্টির দিনের বোনাস!", body: `${count}টি ডেলিভারির জন্য ${bdt(total)} আপনার ওয়ালেটে যোগ হয়েছে।` };

/** "18:00–22:00" for the admin form and rider card. */
export const peakWindowLabel = (s: Pick<OrderBonusSettings, "peakStartHour" | "peakEndHour">): string => {
  const hh = (n: number): string => `${String(n).padStart(2, "0")}:00`;
  return `${hh(s.peakStartHour)}–${hh(s.peakEndHour)}`;
};
