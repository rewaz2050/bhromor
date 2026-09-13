/**
 * Size Finder (P0 #1) — a height/weight fit estimator for the product page.
 *
 * Why this exists: size is the #1 reason clothing comes back, and the catalog
 * has no verified per-garment measurement chart yet (see
 * `components/product/size-guide.tsx`, which says exactly that). So this is
 * deliberately an ESTIMATOR — body measurements inferred from height, weight
 * and a fit preference — and the copy never claims more than that. When a real
 * measurement chart lands on the product, the chart wins.
 *
 * Bands are tuned for Bangladeshi garment grading (half-chest ×2 in cm), which
 * runs a size slimmer than US/UK charts with the same letters.
 *
 * Pure + localStorage-backed, so it works for guests, survives reloads, and is
 * unit-testable without a browser.
 */

import type { Product } from "./catalog";

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

export type FitPreference = "slim" | "regular" | "relaxed";

export interface SizeProfile {
  heightCm: number;
  weightKg: number;
  fit: FitPreference;
  /** Optional measured chest; beats the estimate when given. */
  chestCm?: number;
  /** Optional measured waist; used by trouser/lungi advice. */
  waistCm?: number;
}

export const SIZE_PROFILE_KEY = "prosanti.size-profile.v1";

const FIT_SHIFT_CM: Record<FitPreference, number> = {
  slim: -3,
  regular: 0,
  relaxed: 3,
};

const num = (value: unknown): number | null => {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Rejects anything implausible instead of guessing — a wrong size suggestion
 *  is worse than none. */
export const sanitizeProfile = (raw: unknown): SizeProfile | null => {
  const r = (raw ?? {}) as Record<string, unknown>;
  const heightCm = num(r.heightCm);
  const weightKg = num(r.weightKg);
  if (heightCm === null || weightKg === null) return null;
  if (heightCm < 120 || heightCm > 220) return null;
  if (weightKg < 25 || weightKg > 200) return null;
  const fit = (["slim", "regular", "relaxed"] as const).includes(
    r.fit as FitPreference,
  )
    ? (r.fit as FitPreference)
    : "regular";
  const chestCm = num(r.chestCm);
  const waistCm = num(r.waistCm);
  return {
    heightCm: Math.round(heightCm),
    weightKg: Math.round(weightKg * 10) / 10,
    fit,
    ...(chestCm !== null && chestCm >= 60 && chestCm <= 180
      ? { chestCm: Math.round(chestCm) }
      : {}),
    ...(waistCm !== null && waistCm >= 50 && waistCm <= 170
      ? { waistCm: Math.round(waistCm) }
      : {}),
  };
};

/* ------------------------------------------------------------------ */
/* Garment families                                                    */
/* ------------------------------------------------------------------ */

export type GarmentFamily = "upper" | "waist" | "drape" | "one-size";

const UPPER = ["panjabi", "shirt", "t-shirt", "tee", "kurti", "kameez", "three-piece", "dress", "anarkali"];
const WAIST = ["trouser", "pajama", "pajamas", "pants"];
const DRAPE = ["lungi", "gamcha", "saree", "shawl", "scarf", "dupatta", "cap", "topi"];

const familyOf = (product: Product): GarmentFamily => {
  if (product.sizes.length === 1 && /free|one size/i.test(product.sizes[0] ?? "")) {
    return "one-size";
  }
  const key = `${product.subCategory} ${product.name}`.toLowerCase();
  if (WAIST.some((w) => key.includes(w))) return "waist";
  if (UPPER.some((u) => key.includes(u))) return "upper";
  if (DRAPE.some((d) => key.includes(d))) return "drape";
  return product.sizes.length > 1 ? "upper" : "one-size";
};

export const sizeFamily = (product: Product): GarmentFamily => familyOf(product);

/** Full-body garment bands, in cm of body measurement (not half-chest). */
const UPPER_BANDS: { size: string; min: number; max: number }[] = [
  { size: "XS", min: 86, max: 94 },
  { size: "S", min: 92, max: 99 },
  { size: "M", min: 97, max: 105 },
  { size: "L", min: 103, max: 112 },
  { size: "XL", min: 110, max: 119 },
  { size: "XXL", min: 117, max: 128 },
  { size: "3XL", min: 126, max: 140 },
];

const WAIST_BANDS: { size: string; min: number; max: number }[] = [
  { size: "S", min: 71, max: 81 },
  { size: "M", min: 79, max: 91 },
  { size: "L", min: 89, max: 101 },
  { size: "XL", min: 99, max: 111 },
  { size: "XXL", min: 109, max: 123 },
  { size: "3XL", min: 121, max: 136 },
];

const normToken = (size: string): string => {
  const s = size.trim().toUpperCase();
  if (/^(FREE|ONE)\s*(SIZE)?$/.test(s)) return "OS";
  if (/^2XL$/.test(s)) return "XXL";
  if (/^3XL$/.test(s)) return "3XL";
  if (/^4XL$/.test(s)) return "3XL";
  return s;
};

/**
 * Estimated chest/waist in cm. The coefficients are a plain linear body model
 * around the reference body (170 cm / 70 kg ⇒ 100 cm chest), which is what
 * BD grading tables are built on; a measured value always wins.
 */
export const estimateChestCm = (profile: SizeProfile): number => {
  if (profile.chestCm) return profile.chestCm;
  const base = 100 + 1.05 * (profile.weightKg - 70) + 0.32 * (profile.heightCm - 170);
  return Math.round(base + FIT_SHIFT_CM[profile.fit]);
};

export const estimateWaistCm = (profile: SizeProfile): number => {
  if (profile.waistCm) return profile.waistCm;
  const base = 79 + 1.15 * (profile.weightKg - 70) + 0.18 * (profile.heightCm - 170);
  return Math.round(base + FIT_SHIFT_CM[profile.fit]);
};

export type SizeVerdict = "best" | "snug" | "roomy" | "skip";

export interface SizeScore {
  size: string;
  /** 0–100 — how close the body lands to the middle of that size's band. */
  score: number;
  verdict: SizeVerdict;
}

export type FitAdvisory = "ok" | "no-body" | "one-size" | "off-band";

export interface SizeSuggestion {
  family: GarmentFamily;
  recommended: string | null;
  /** Best available when nothing fits well — shown as "closest", not "wear this". */
  closest: string | null;
  scores: SizeScore[];
  /** 0–100 confidence in the recommendation itself (band-edge cases are low). */
  confidence: number;
  advisory: FitAdvisory;
  /** Which measurement drove the answer, for honest display. */
  measured: "chest" | "waist" | "none";
  measurementCm: number | null;
  note: string;
}

/** One centimetre off the middle of a band costs 8 points; 12 cm off is zero.
 *  A single curve for every family keeps the score comparable across products
 *  — a "72" means the same thing on a panjabi and a trouser. */
export const SIZE_SCORE_STEP_CM = 12;

const scoreFromDistance = (distanceCm: number): number =>
  Math.max(0, Math.min(100, Math.round(100 - (Math.abs(distanceCm) / SIZE_SCORE_STEP_CM) * 100)));

const verdictFor = (
  centre: number,
  measurement: number,
): SizeVerdict => {
  const delta = measurement - centre;
  if (Math.abs(delta) <= 2.5) return "best";
  return delta > 0 ? "snug" : "roomy";
};

/** Shops sell trousers in inch waists; that is a real measurement, not noise. */
const inchWaistCm = (token: string): number | null => {
  if (!/^\d{2}$/.test(token)) return null;
  const inch = Number(token);
  return inch >= 26 && inch <= 52 ? Math.round(inch * 2.54) : null;
};

/**
 * Score every size the product actually sells, then recommend the best. Sizes
 * outside the graded bands (a shop's own labels, inch waists) are resolved too,
 * so nothing silently disappears from the picker.
 */
export const suggestSize = (
  product: Product,
  profile: SizeProfile | null,
): SizeSuggestion => {
  const family = familyOf(product);
  const heightNote = (useWaist: boolean): string =>
    !useWaist && profile && profile.heightCm >= 182
      ? " You are tall for our grading — the hem will sit a little shorter; size up if you like coverage."
      : !useWaist && profile && profile.heightCm <= 162
        ? " You are on the shorter side — expect extra length; a tailor's 2-inch hem is cheaper than a return."
        : "";

  const none: SizeSuggestion = {
    family,
    recommended: null,
    closest: null,
    scores: [],
    confidence: 0,
    advisory: "no-body",
    measured: "none",
    measurementCm: null,
    note:
      family === "one-size" || family === "drape"
        ? "One size — no grading to match."
        : "Add your height and weight for a size suggestion.",
  };
  if (family === "one-size") {
    return {
      ...none,
      advisory: "one-size",
      recommended: product.sizes[0] ?? null,
      confidence: 100,
      note: "One size — check the listed dimensions for length and width.",
    };
  }
  if (family === "drape") {
    return {
      ...none,
      advisory: "one-size",
      recommended: product.sizes.length === 1 ? product.sizes[0] : null,
      confidence: 90,
      note: "Lungi, gamcha and caps are cut to drape — no size maths needed.",
    };
  }
  if (!profile) return none;

  const useWaist = family === "waist";
  const measurement = useWaist ? estimateWaistCm(profile) : estimateChestCm(profile);
  const table = useWaist ? WAIST_BANDS : UPPER_BANDS;
  const scored = product.sizes.map((raw) => {
    const token = normToken(raw);
    if (token === "OS") {
      return { size: raw, score: 70, verdict: "roomy" as SizeVerdict, band: null, offBy: 0 };
    }
    const inch = inchWaistCm(token);
    const band =
      table.find((b) => b.size === token) ??
      (inch === null ? null : { min: inch - 5, max: inch + 5 });
    if (!band) return { size: raw, score: 0, verdict: "skip" as SizeVerdict, band: null, offBy: 0 };
    const centre = (band.min + band.max) / 2;
    const verdict: SizeVerdict =
      measurement < band.min - 4 || measurement > band.max + 4
        ? "skip"
        : verdictFor(centre, measurement);
    return {
      size: raw,
      score: scoreFromDistance(measurement - centre),
      verdict,
      band: { min: band.min, max: band.max },
      offBy: measurement - centre,
    };
  });
  const scores: SizeScore[] = scored.map(({ size, score, verdict }) => ({
    size,
    score,
    verdict,
  }));

  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const runnerUp = ranked[1];
  const detail = scored.find((s) => s.size === top?.size);
  const label = useWaist ? "waist" : "chest";
  if (!top || top.score < 35) {
    // Say WHICH way it misses: "closest" for a body bigger than every size is
    // not the same advice as for one smaller than all of them.
    const reads = detail ? (detail.offBy > 0 ? "tight" : "loose") : "off";
    return {
      family,
      recommended: null,
      closest: top ? top.size : null,
      scores,
      confidence: top ? Math.max(20, top.score) : 0,
      advisory: "off-band",
      measured: useWaist ? "waist" : "chest",
      measurementCm: measurement,
      note:
        `None of this item's sizes (${product.sizes.join(", ")}) sit well at your estimated ${label} of ${measurement} cm` +
        `${top ? ` — ${top.size} is the closest and will read ${reads}.` : "."}` +
        heightNote(useWaist),
    };
  }
  const gap = runnerUp ? top.score - runnerUp.score : 40;
  const confidence = Math.max(45, Math.min(98, Math.round(top.score * 0.8 + gap * 0.6)));
  return {
    family,
    recommended: top.size,
    closest: top.size,
    scores,
    confidence,
    advisory: "ok",
    measured: useWaist ? "waist" : "chest",
    measurementCm: measurement,
    note:
      `Estimated ${label} ${measurement} cm · ${profile.fit} fit` +
      (detail?.band ? ` · ${top.size} covers ${detail.band.min}–${detail.band.max} cm` : "") +
      `.${heightNote(useWaist)}`,
  };
};

/** The "size fit" badge on a single size button in the picker. */
export const fitForSize = (
  product: Product,
  profile: SizeProfile | null,
  size: string,
): SizeScore | null =>
  suggestSize(product, profile).scores.find((s) => s.size === size) ?? null;

/* ------------------------------------------------------------------ */
/* Device-local storage (guest-safe, syncs to nothing — it is a body,   */
/* not an order), following the wishlist-store pattern.                */
/* ------------------------------------------------------------------ */

type Listener = () => void;
const listeners = new Set<Listener>();
let cache: SizeProfile | null | undefined;

const notify = () => {
  for (const l of listeners) l();
};

const readStorage = (): SizeProfile | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SIZE_PROFILE_KEY);
    if (!raw) return null;
    return sanitizeProfile(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
};

export const getSizeProfile = (): SizeProfile | null => {
  if (cache === undefined) cache = readStorage();
  return cache;
};

/** Stable reference for useSyncExternalStore (null is fine, a new object is not). */
export const getSizeProfileServer = (): SizeProfile | null => null;

export const subscribeSizeProfile = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const saveSizeProfile = (profile: SizeProfile): boolean => {
  const clean = sanitizeProfile(profile);
  if (!clean) return false;
  cache = clean;
  try {
    window.localStorage.setItem(SIZE_PROFILE_KEY, JSON.stringify(clean));
  } catch {
    /* storage unavailable — the profile still works for this page view */
  }
  notify();
  return true;
};

export const clearSizeProfile = (): void => {
  cache = null;
  try {
    window.localStorage.removeItem(SIZE_PROFILE_KEY);
  } catch {
    /* ignore */
  }
  notify();
};

/** Test-only: drop the module cache between cases. */
export const __resetSizeProfile = (): void => {
  cache = undefined;
};

/**
 * The variant label a shopper's body should land on, in the exact
 * `"Colour · Size"` shape the cart and the order validator parse. Used by
 * "add the set" (P0 #2) so a bundle does not add four sizes nobody picked.
 */
export const variantLabelFor = (product: Product, size: string | null): string => {
  const color = product.colors[0] ?? "";
  const hasSizes =
    product.sizes.length > 0 &&
    (product.sizes.length > 1 || !/free|one size/i.test(product.sizes[0] ?? ""));
  const chosen = hasSizes ? (size ?? product.sizes[0] ?? "") : (product.sizes[0] ?? "");
  if (color && chosen) return `${color} · ${chosen}`;
  return color || chosen || "Default";
};

/** Recommended size for this product, or null when the body is unknown. */
export const recommendedSizeFor = (
  product: Product,
  profile: SizeProfile | null,
): string | null => {
  const out = suggestSize(product, profile);
  return out.recommended;
};
