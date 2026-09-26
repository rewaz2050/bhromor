/**
 * Homepage CMS skeleton (§31) — live only.
 *
 * Holds the announcement bar copy, hero copy and visibility for the deliberately
 * short editorial homepage. Staff-published settings overlay the shipped
 * defaults server-side (see /api/homepage and src/lib/use-cms.ts); this module
 * carries the shared types and defaults only.
 */

export interface HomeSettings {
  announcement: { enabled: boolean; text: string };
  hero: {
    eyebrow: string;
    title1: string;
    title2: string;
    subtitle: string;
    primaryLabel: string;
  };
  /**
   * A public promo code the owner wants every visitor to see (a welcome
   * code, an Eid code). Purely an advertisement: the code itself must exist
   * as an active coupon — checkout validates against the coupon table, this
   * line never discounts anything on its own.
   */
  promo: { enabled: boolean; code: string; text: string };
  sections: Record<SectionKey, boolean>;
}

/**
 * The storefront homepage (2026-09-20) is a shelf, top to bottom:
 * compact hero → (recently viewed strip, returning devices only) → category
 * row → offers → every category with its pieces → customer stories →
 * service strip. Only the blocks an owner may want to hide are listed here;
 * the category shelf itself is the page and cannot be switched off.
 *
 * `collections` is the category row's key (kept from the older layout so a
 * previously published toggle still applies). Retired keys (`featured`,
 * `brandStory`, `brandJournal`) are ignored by `resolveSettings`.
 */
export const SECTION_KEYS = ["hero", "recent", "collections", "bestSellers", "newArrivals", "offers", "stories", "trust"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  hero: "Compact hero (headline + button)",
  recent: "Recently viewed strip (returning visitors only)",
  collections: "Category row",
  bestSellers: "Best sellers rail (ranked by real orders; hidden until 2+ sellers)",
  newArrivals: "New arrivals rail (hidden until 4+ pieces)",
  offers: "Offers (flash drop + reduced prices)",
  stories: "Customer stories (approved reviews only)",
  trust: "Service promise strip",
};

export const HOME_DEFAULTS: HomeSettings = {
  announcement: {
    // On by default (2026-09-20): the delivery promise sits at the top of
    // every page. A published row that switched it off keeps it off.
    enabled: true,
    text: "Cash on Delivery · Instant Delivery in 45–50 min · Easy Returns",
  },
  hero: {
    eyebrow: "PROSANTI",
    title1: "Rooted in tradition.",
    title2: "Made for today.",
    subtitle: "Thoughtfully made essentials for everyday Bangladesh.",
    primaryLabel: "Explore collection",
  },
  promo: {
    enabled: false,
    code: "",
    text: "",
  },
  sections: {
    hero: true,
    recent: true,
    collections: true,
    bestSellers: true,
    newArrivals: true,
    offers: true,
    stories: true,
    trust: true,
  },
};

/** Merge a possibly-partial saved payload over the defaults. */
export const resolveSettings = (partial?: unknown): HomeSettings => {
  if (!partial || typeof partial !== "object") return HOME_DEFAULTS;
  const p = partial as Partial<HomeSettings>;
  const ann = { ...HOME_DEFAULTS.announcement, ...(p.announcement ?? {}) };
  const hero = { ...HOME_DEFAULTS.hero, ...(p.hero ?? {}) };
  const promo = { ...HOME_DEFAULTS.promo, ...(p.promo ?? {}) };
  const savedSections =
    p.sections && typeof p.sections === "object" ? p.sections : {};
  const sections = SECTION_KEYS.reduce(
    (next, key) => {
      const saved = (savedSections as Record<string, unknown>)[key];
      next[key] =
        typeof saved === "boolean" ? saved : HOME_DEFAULTS.sections[key];
      return next;
    },
    {} as Record<SectionKey, boolean>,
  );
  return { announcement: ann, hero, promo, sections };
};

/** The advertised code, normalised the way checkout matches it. */
export const publicPromoCode = (settings: HomeSettings): string | null => {
  if (!settings.promo.enabled) return null;
  const code = settings.promo.code.trim().toUpperCase().replace(/\s+/g, "");
  return code.length > 0 ? code : null;
};
