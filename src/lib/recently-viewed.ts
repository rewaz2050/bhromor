/**
 * Recently viewed (Batch L) — this device's browsing trail.
 *
 * Why it matters: most shoppers in Sunamganj arrive on a phone, look at two
 * or three pieces, get interrupted, and come back the next day with nothing
 * but a browser history. This keeps the last few pieces one tap away — on the
 * product page itself and on the homepage.
 *
 * Deliberately local-only: it is a browsing trail, not a profile. Nothing is
 * sent to the server, no cookie, no account needed, and "Clear" empties it.
 *
 * The stored shape is the id + slug only (no names, prices or images) — a
 * cached price would be a lie the moment the shop changes it, so the rail
 * always resolves entries against the live catalog and simply drops the ones
 * that have since gone away.
 */

export const RECENTLY_VIEWED_KEY = "prosanti.recently-viewed.v1";
/** Twelve is a shelf, not a history: enough to recognise your trail. */
export const RECENTLY_VIEWED_MAX = 12;
/** How many pieces the rail itself shows. */
export const RECENTLY_VIEWED_RAIL = 8;

export interface ViewedEntry {
  id: string;
  slug: string;
  /** Epoch ms of the last look — newest first in the list. */
  at: number;
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

export const parseViews = (raw: string | null): ViewedEntry[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: ViewedEntry[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      const { id, slug, at } = row as Partial<ViewedEntry>;
      if (typeof id !== "string" || typeof slug !== "string") continue;
      if (id === "" || seen.has(id)) continue;
      seen.add(id);
      out.push({
        id: id.slice(0, 64),
        slug: slug.slice(0, 120),
        at: typeof at === "number" && Number.isFinite(at) ? at : 0,
      });
      if (out.length >= RECENTLY_VIEWED_MAX) break;
    }
    return out;
  } catch {
    return [];
  }
};

/** Most recent look first, no duplicates, capped. */
export const pushView = (
  list: ViewedEntry[],
  entry: { id: string; slug: string },
  at = Date.now(),
  max = RECENTLY_VIEWED_MAX,
): ViewedEntry[] => {
  if (!entry.id) return list;
  const rest = list.filter((row) => row.id !== entry.id);
  return [{ id: entry.id, slug: entry.slug, at }, ...rest].slice(0, max);
};

/* ------------------------------------------------------------------ */
/* External store (useSyncExternalStore)                               */
/* ------------------------------------------------------------------ */

type Listener = () => void;

let cache: ViewedEntry[] | null = null;
let loaded = false;
const listeners = new Set<Listener>();
/** Stable empty snapshot — a fresh [] on every call would loop the hook. */
const EMPTY: ViewedEntry[] = [];
export const getRecentlyViewedServer = () => EMPTY;

const notify = () => {
  for (const listener of listeners) listener();
};

const ensureLoaded = (): ViewedEntry[] => {
  if (cache && loaded) return cache;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      cache = parseViews(window.localStorage.getItem(RECENTLY_VIEWED_KEY));
      return cache;
    } catch {
      // storage blocked (private mode) → trail lives in memory only
    }
  }
  cache = [];
  return cache;
};

const persist = (next: ViewedEntry[]) => {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — the in-memory list still works this session
    }
  }
  notify();
};

let storageBound = false;
const bindStorage = () => {
  if (storageBound || typeof window === "undefined") return;
  storageBound = true;
  /* Two tabs open (product in one, home in the other) must agree, and the
     admin's storefront preview tab must not show a stale trail. */
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== RECENTLY_VIEWED_KEY) return;
    cache = null;
    loaded = false;
    notify();
  });
};

export const subscribeRecentlyViewed = (listener: Listener): (() => void) => {
  bindStorage();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getRecentlyViewed = (): ViewedEntry[] => ensureLoaded();

export const pushRecentlyViewed = (entry: { id: string; slug: string }) =>
  persist(pushView(ensureLoaded(), entry));

/** Forget one entry — used when a product page 404s on a stale slug. */
export const dropRecentlyViewed = (id: string) =>
  persist(ensureLoaded().filter((row) => row.id !== id));

export const clearRecentlyViewed = () => persist([]);
