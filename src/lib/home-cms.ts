/**
 * Homepage CMS skeleton (§31) — demo, browser-local.
 *
 * Holds the announcement bar copy, hero copy and section visibility.
 * Until a CMS backend exists, saved settings overlay the design defaults;
 * resetting clears the overlay back to the shipped homepage.
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
    secondaryLabel: string;
  };
  sections: Record<SectionKey, boolean>;
}

export const SECTION_KEYS = [
  "hero",
  "trust",
  "featured",
  "collections",
  "newArrivals",
  "brandStory",
  "deliveryPromise",
  "shopByMood",
  "budgetEdit",
  "customerStories",
  "brandJournal",
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_LABELS: Record<SectionKey, string> = {
  hero: "Hero",
  trust: "Trust strip",
  featured: "Featured products",
  collections: "Collections",
  newArrivals: "New arrivals",
  brandStory: "Brand story",
  deliveryPromise: "Delivery promise",
  shopByMood: "Shop by Mood",
  budgetEdit: "Under ৳500",
  customerStories: "Customer stories (demo preview)",
  brandJournal: "Visual journal",
};

export const HOME_DEFAULTS: HomeSettings = {
  announcement: {
    enabled: true,
    text: "Rapid local delivery · 45–50 min inside the service area · Cash on Delivery available",
  },
  hero: {
    eyebrow: "The new Bangladeshi everyday",
    title1: "Rooted in Tradition.",
    title2: "Made for Today.",
    subtitle:
      "প্রশান্তি — a considered edit of premium essentials, delivered fast and transparently to your door.",
    primaryLabel: "Shop Men",
    secondaryLabel: "Shop Women",
  },
  sections: {
    hero: true,
    trust: true,
    featured: true,
    collections: true,
    newArrivals: true,
    brandStory: true,
    deliveryPromise: true,
    shopByMood: true,
    budgetEdit: true,
    customerStories: true,
    brandJournal: true,
  },
};

/** Merge a possibly-partial saved payload over the defaults. */
export const resolveSettings = (partial?: unknown): HomeSettings => {
  if (!partial || typeof partial !== "object") return HOME_DEFAULTS;
  const p = partial as Partial<HomeSettings>;
  const ann = { ...HOME_DEFAULTS.announcement, ...(p.announcement ?? {}) };
  const hero = { ...HOME_DEFAULTS.hero, ...(p.hero ?? {}) };
  const sections = { ...HOME_DEFAULTS.sections, ...(p.sections ?? {}) };
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
  for (const l of listeners) l();
};

const ensureLoaded = (): HomeSettings => {
  if (cache && loaded) return cache;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(HOME_CMS_KEY);
      if (raw) cache = resolveSettings(JSON.parse(raw));
    } catch {
      // corrupted storage → defaults
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
      // storage unavailable — demo continues in memory
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
