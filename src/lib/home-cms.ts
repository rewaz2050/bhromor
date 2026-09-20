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
  sections: Record<SectionKey, boolean>;
}

/**
 * The storefront homepage (2026-09-20) is a shelf, top to bottom:
 * compact hero → category row → offers → every category with its pieces →
 * service strip. Only the blocks an owner may want to hide are listed here;
 * the category shelf itself is the page and cannot be switched off.
 *
 * `collections` is the category row's key (kept from the older layout so a
 * previously published toggle still applies). Retired keys (`featured`,
 * `brandStory`, `brandJournal`) are ignored by `resolveSettings`.
 */
export const SECTION_KEYS = ["hero", "collections", "offers", "trust"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  hero: "Compact hero (headline + button)",
  collections: "Category row",
  offers: "Offers (flash drop + reduced prices)",
  trust: "Service promise strip",
};

export const HOME_DEFAULTS: HomeSettings = {
  announcement: {
    enabled: false,
    text: "Cash on Delivery · Instant Delivery in 45–50 min · Easy Returns",
  },
  hero: {
    eyebrow: "PROSANTI",
    title1: "Rooted in tradition.",
    title2: "Made for today.",
    subtitle: "Thoughtfully made essentials for everyday Bangladesh.",
    primaryLabel: "Explore collection",
  },
  sections: {
    hero: true,
    collections: true,
    offers: true,
    trust: true,
  },
};

/** Merge a possibly-partial saved payload over the defaults. */
export const resolveSettings = (partial?: unknown): HomeSettings => {
  if (!partial || typeof partial !== "object") return HOME_DEFAULTS;
  const p = partial as Partial<HomeSettings>;
  const ann = { ...HOME_DEFAULTS.announcement, ...(p.announcement ?? {}) };
  const hero = { ...HOME_DEFAULTS.hero, ...(p.hero ?? {}) };
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
  return { announcement: ann, hero, sections };
};
