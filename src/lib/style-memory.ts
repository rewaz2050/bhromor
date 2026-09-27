/**
 * Style Match memory (UX plan §10, R7) — the last query the shopper built on
 * /style, kept on this device so the home page can greet them with "new in
 * your style". Pure storage: no account, nothing sent anywhere.
 */

import type { StyleQuery } from "./style-match";
import { isStyleQueryEmpty } from "./style-match";

export const STYLE_QUERY_KEY = "prosanti.style-query.v1";
/** A remembered style goes stale — tastes and seasons move on. */
export const STYLE_QUERY_TTL_MS = 60 * 86_400_000;

export interface StoredStyle {
  query: StyleQuery;
  at: number;
}

const listeners = new Set<() => void>();
let cache: StoredStyle | null | undefined;

const sanitize = (raw: unknown): StoredStyle | null => {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<StoredStyle>;
  const q = (r.query ?? {}) as Partial<StyleQuery>;
  const query: StyleQuery = {
    occasion: typeof q.occasion === "string" && q.occasion ? q.occasion.slice(0, 40) : undefined,
    budgetTaka:
      typeof q.budgetTaka === "number" && Number.isFinite(q.budgetTaka) && q.budgetTaka > 0
        ? Math.round(q.budgetTaka)
        : null,
    colors: Array.isArray(q.colors) ? q.colors.filter((c): c is string => typeof c === "string").slice(0, 3) : [],
    size: typeof q.size === "string" && q.size ? q.size.slice(0, 12) : null,
    categoryId: typeof q.categoryId === "string" && q.categoryId ? q.categoryId.slice(0, 40) : null,
  };
  if (isStyleQueryEmpty(query)) return null;
  const at = typeof r.at === "number" && Number.isFinite(r.at) ? r.at : 0;
  if (!at || Date.now() - at > STYLE_QUERY_TTL_MS) return null;
  return { query, at };
};

const read = (): StoredStyle | null => {
  if (typeof window === "undefined") return null;
  try {
    return sanitize(JSON.parse(window.localStorage.getItem(STYLE_QUERY_KEY) ?? "null"));
  } catch {
    return null;
  }
};

const notify = () => listeners.forEach((l) => l());

export const getStoredStyle = (): StoredStyle | null => {
  if (cache === undefined) cache = read();
  return cache;
};
export const getStoredStyleServer = (): StoredStyle | null => null;
export const subscribeStoredStyle = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Remember a non-empty query; empty queries clear the memory. */
export const saveStyleQuery = (query: StyleQuery): void => {
  if (typeof window === "undefined") return;
  const next: StoredStyle | null = isStyleQueryEmpty(query) ? null : { query, at: Date.now() };
  try {
    if (next) window.localStorage.setItem(STYLE_QUERY_KEY, JSON.stringify(next));
    else window.localStorage.removeItem(STYLE_QUERY_KEY);
  } catch {
    /* private mode — the home rail simply will not remember */
  }
  cache = next;
  notify();
};

export const clearStyleQuery = (): void => saveStyleQuery({});

/** Test seam. */
export const __resetStyleMemoryForTests = (): void => {
  cache = undefined;
};
