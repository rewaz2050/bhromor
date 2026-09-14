/**
 * Fabric transparency (P2 #21) — the "quality card" a cloth buyer deserves
 * and a food app never shows: GSM, the maker, an optional test report, and
 * the shop's own "quality checked" declaration.
 *
 * This is SHOP-DECLARED data, stored per product and never assumed:
 * absent fields render nothing at all — there is no default GSM, no generic
 * "premium quality" copy, and "Quality checked" only ever shows when the
 * shop actually ticked it for that piece. The parsing here is the single
 * rule shared by the editor, the API and the storefront mapper.
 */

export interface FabricInfo {
  /** Fabric weight in grams per square metre (30–1000). null = not declared. */
  gsm: number | null;
  /** Who wove it (mill / workshop name). null = not declared. */
  manufacturer: string | null;
  /** Full http(s) link to the fabric test report document. null = none. */
  reportUrl: string | null;
  /** The shop declares this piece quality-checked before dispatch. */
  qualityChecked: boolean;
}

export class FabricInputError extends Error {
  readonly status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.name = "FabricInputError";
    this.status = status;
  }
}

const blank = (v: unknown): boolean =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "");

const isHttpUrl = (raw: string): boolean => {
  try {
    const u = new URL(raw);
    return (u.protocol === "https:" || u.protocol === "http:") && u.host.includes(".");
  } catch {
    return false;
  }
};

/**
 * Parse the four transparency fields from a raw request body. Only called
 * when at least one key is present (the editors always send the full set,
 * so an empty string means "clear", never "ignore").
 */
export const parseFabricTransparency = (
  raw: Record<string, unknown>,
): FabricInfo => {
  const gsmRaw = raw.fabricGsm;
  let gsm: number | null = null;
  if (!blank(gsmRaw)) {
    const n = Number(gsmRaw);
    if (!Number.isInteger(n) || n < 30 || n > 1000) {
      throw new FabricInputError(
        "Fabric weight must be a whole GSM number between 30 and 1000.",
      );
    }
    gsm = n;
  }

  let manufacturer: string | null = null;
  if (!blank(raw.manufacturer)) {
    const m = String(raw.manufacturer).trim().replace(/\s+/g, " ");
    if (m.length > 120) {
      throw new FabricInputError("Manufacturer name is too long (max 120 characters).");
    }
    manufacturer = m;
  }

  let reportUrl: string | null = null;
  if (!blank(raw.testReportUrl)) {
    const u = String(raw.testReportUrl).trim();
    if (u.length > 300 || !isHttpUrl(u)) {
      throw new FabricInputError(
        "Test report must be a full http(s) link to the document.",
      );
    }
    reportUrl = u;
  }

  const qualityChecked = raw.qualityChecked === true;

  return { gsm, manufacturer, reportUrl, qualityChecked };
};

/** Does this product carry anything on its quality card? (render gate) */
export const hasFabricInfo = (
  p: Partial<FabricInfo> & { qualityChecked?: boolean },
): boolean =>
  (p.gsm ?? null) !== null ||
  Boolean(p.manufacturer) ||
  Boolean(p.reportUrl) ||
  p.qualityChecked === true;

/** Short, honest one-liner for the quality card (never invents adjectives). */
export const gsmBand = (gsm: number): string => {
  if (gsm <= 110) return "light";
  if (gsm <= 170) return "mid-weight";
  if (gsm <= 240) return "heavy";
  return "extra-heavy";
};
