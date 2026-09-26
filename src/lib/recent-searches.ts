/**
 * Recent searches — on this device only (UX plan §1.2). Nothing is sent
 * anywhere; the list is a convenience for the person who typed it.
 */

export const RECENT_SEARCHES_KEY = "prosanti.recent-searches.v1";
export const RECENT_SEARCHES_MAX = 6;

const canStore = (): boolean => typeof window !== "undefined" && !!window.localStorage;

const sanitize = (raw: unknown): string[] =>
  Array.isArray(raw)
    ? raw
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => v.length >= 2 && v.length <= 60)
        .slice(0, RECENT_SEARCHES_MAX)
    : [];

export const getRecentSearches = (): string[] => {
  if (!canStore()) return [];
  try {
    return sanitize(JSON.parse(window.localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]"));
  } catch {
    return [];
  }
};

const write = (list: string[]): string[] => {
  if (canStore()) {
    try {
      if (list.length === 0) window.localStorage.removeItem(RECENT_SEARCHES_KEY);
      else window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
    } catch {
      /* private mode / quota — the list simply is not kept */
    }
  }
  return list;
};

/** Most recent first, case-insensitively deduped, capped. Returns the new list. */
export const rememberSearch = (query: string): string[] => {
  const value = query.trim();
  if (value.length < 2) return getRecentSearches();
  const key = value.toLocaleLowerCase();
  const rest = getRecentSearches().filter((q) => q.toLocaleLowerCase() !== key);
  return write([value, ...rest].slice(0, RECENT_SEARCHES_MAX));
};

export const clearRecentSearches = (): string[] => write([]);
