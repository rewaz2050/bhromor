/**
 * Wishlist store (§29) — demo, browser-local.
 * Pure list helpers on top; external store below feeds useSyncExternalStore.
 */

export const WISHLIST_STORAGE_KEY = "prosanti.wishlist.v1";

export const toggleWish = (list: string[], id: string): string[] =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

export const removeWish = (list: string[], id: string): string[] =>
  list.filter((x) => x !== id);

/* ------------------------------------------------------------------ */

type Listener = () => void;

let cache: string[] | null = null;
let loaded = false;
const listeners = new Set<Listener>();
const EMPTY: string[] = [];
export const getWishlistServer = () => EMPTY;

const notify = () => {
  for (const l of listeners) l();
};

const ensureLoaded = (): string[] => {
  if (cache && loaded) return cache;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(WISHLIST_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        if (Array.isArray(parsed)) {
          cache = [
            ...new Set(
              parsed.filter((id): id is string => typeof id === "string"),
            ),
          ];
          return cache;
        }
      }
    } catch {
      // corrupted storage → start empty
    }
  }
  cache = [];
  return cache;
};

const persist = (next: string[]) => {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — demo continues in memory
    }
  }
  notify();
};

/**
 * Cross-tab / cross-surface sync: the wishlist lives in localStorage, so a
 * change made in another tab (or in the admin preview tab) must reach this
 * one. Without this the heart icons silently disagreed between tabs.
 */
let storageBound = false;
const bindStorage = () => {
  if (storageBound || typeof window === "undefined") return;
  storageBound = true;
  window.addEventListener("storage", (event) => {
    if (event.key !== null && event.key !== WISHLIST_STORAGE_KEY) return;
    cache = null;
    loaded = false;
    notify();
  });
};

export const subscribeWishlist = (listener: Listener): (() => void) => {
  bindStorage();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getWishlist = (): string[] => ensureLoaded();

export const toggleWishlistStore = (id: string) =>
  persist(toggleWish(ensureLoaded(), id));

export const clearWishlistStore = () => persist([]);
