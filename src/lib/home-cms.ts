/**
 * Homepage CMS skeleton (§31) — demo, browser-local.
 *
 * Holds the announcement bar copy, hero copy and visibility for the deliberately
 * short editorial homepage. Saved settings overlay the shipped defaults;
 * resetting clears the browser overlay.
 */

export const HOME_CMS_KEY = "prosanti.admin.homepage.v1";

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
 * Product campaigns, budget edits and new-arrival rails live on /shop. Keeping
 * them out of this list prevents the landing page from becoming repetitive.
 */
export const SECTION_KEYS = [
  "hero",
  "collections",
  "featured",
  "brandStory",
  "trust",
  "brandJournal",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  hero: "Cinematic hero",
  collections: "Collections",
  featured: "Best sellers",
  brandStory: "Brand philosophy",
  trust: "Service promise strip",
  brandJournal: "Visual journal",
};

export const HOME_DEFAULTS: HomeSettings = {
  announcement: {
    enabled: false,
    text: "Cash on Delivery · Fast Delivery · Easy Returns · Order Tracking",
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
    featured: true,
    brandStory: true,
    trust: true,
    brandJournal: true,
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

/* ------------------------------------------------------------------ */
/* External store                                                      */
/* ------------------------------------------------------------------ */

type Listener = () => void;

let cache: HomeSettings | null = null;
let loaded = false;
const listeners = new Set<Listener>();

const notify = () => {
  for (const listener of listeners) listener();
};

const ensureLoaded = (): HomeSettings => {
  if (cache && loaded) return cache;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(HOME_CMS_KEY);
      if (raw) cache = resolveSettings(JSON.parse(raw));
    } catch {
      // Corrupted storage falls back to the shipped edit.
    }
  }
  cache ??= HOME_DEFAULTS;
  return cache;
};

const persist = (next: HomeSettings) => {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(HOME_CMS_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable — the editor continues in memory.
    }
  }
  notify();
};

export const subscribeCms = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Server-safe initial snapshot = shipped defaults. */
export const getCmsServer = (): HomeSettings => HOME_DEFAULTS;

export const getCms = (): HomeSettings => ensureLoaded();

export const saveCms = (settings: HomeSettings) => persist(settings);

export const resetCms = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(HOME_CMS_KEY);
  }
  persist(HOME_DEFAULTS);
};
