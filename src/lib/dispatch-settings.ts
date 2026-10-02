/**
 * J (2026-10-02) — dispatch rules as admin-editable settings. Pure, client-safe.
 *
 * Three numbers shape every delivery. They live in `site_settings` as flat keys
 * (SQL reads them with `ps_setting_int`, see 202610020003_dispatch_settings.sql):
 *
 *   rider_cash_cap_paisa   cash a rider may hold before dispatch stops
 *   offer_ttl_seconds      how long a job offer stays open
 *   delivery_max_attempts  delivery attempts before a job is closed as failed
 *
 * The bounds below mirror the clamps inside the SQL helpers: a typo can neither
 * lock every rider out nor make offers unusable. The defaults equal the values
 * that used to be hardcoded, so a shop that never opens the editor sees no change.
 */

export const DISPATCH_KEYS = {
  cashCap: "rider_cash_cap_paisa",
  offerTtl: "offer_ttl_seconds",
  maxAttempts: "delivery_max_attempts",
} as const;

export interface DispatchSettings {
  /** Cash a rider may hold before they stop getting offers (paisa). */
  cashCap: number;
  /** Seconds a broadcast offer stays open. */
  offerTtl: number;
  /** Attempts before a failed delivery is closed for good. */
  maxAttempts: number;
}

export const DISPATCH_DEFAULTS: DispatchSettings = {
  cashCap: 500_000,
  offerTtl: 90,
  maxAttempts: 2,
};

export const DISPATCH_BOUNDS = {
  cashCap: { min: 50_000, max: 5_000_000 },
  offerTtl: { min: 30, max: 600 },
  maxAttempts: { min: 1, max: 5 },
} as const;

const FIELD_LABEL: Record<keyof DispatchSettings, string> = {
  cashCap: "Rider cash limit (৳)",
  offerTtl: "Offer window (seconds)",
  maxAttempts: "Max delivery attempts",
};

const toNumber = (raw: unknown): number => {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string" && raw.trim() !== "") return Number(raw);
  return Number.NaN;
};

/** Whole number inside the bounds, or null. */
const readInRange = (raw: unknown, field: keyof DispatchSettings): number | null => {
  const n = toNumber(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  const { min, max } = DISPATCH_BOUNDS[field];
  return n >= min && n <= max ? n : null;
};

/**
 * Strict read for writes: every field must be a whole number inside its range,
 * or the save is refused with a message that names the field and the range.
 */
export const parseDispatchSettings = (
  raw: unknown,
): { settings: DispatchSettings; error?: string } => {
  const p = (raw ?? {}) as Record<string, unknown>;
  const out: Partial<DispatchSettings> = {};
  for (const field of ["cashCap", "offerTtl", "maxAttempts"] as const) {
    const value = readInRange(p[field], field);
    if (value === null) {
      const { min, max } = DISPATCH_BOUNDS[field];
      const shown = field === "cashCap" ? `৳${min / 100} – ৳${max / 100}` : `${min} – ${max}`;
      return {
        settings: DISPATCH_DEFAULTS,
        error: `${FIELD_LABEL[field]} must be a whole number between ${shown}.`,
      };
    }
    out[field] = value;
  }
  return { settings: out as DispatchSettings };
};

/** Lenient read for display/consumers: each unusable field falls back, a stray value is clamped. */
export const sanitizeDispatchSettings = (raw: unknown): DispatchSettings => {
  const p = (raw ?? {}) as Record<string, unknown>;
  const pick = (field: keyof DispatchSettings): number => {
    const n = toNumber(p[field]);
    if (!Number.isFinite(n)) return DISPATCH_DEFAULTS[field];
    const { min, max } = DISPATCH_BOUNDS[field];
    return Math.min(max, Math.max(min, Math.floor(n)));
  };
  return { cashCap: pick("cashCap"), offerTtl: pick("offerTtl"), maxAttempts: pick("maxAttempts") };
};
