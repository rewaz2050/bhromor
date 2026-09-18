/**
 * "আপনার শেষ অর্ডার" — the receipt remembers the order it just placed so the
 * track page can offer it back with one tap (UX audit 2026-09-18, P0 #5).
 *
 * Browser-only, one record, no personal data beyond what the customer typed
 * a second ago (order id + phone). Nothing here is trusted by the server:
 * /api/track still asks for id + phone and answers 404 on a mismatch.
 */

export const LAST_ORDER_KEY = "prosanti.last-order.v1";
/** Keep the shortcut for a week — after that the parcel has long arrived. */
const MAX_AGE_MS = 7 * 86_400_000;

export interface LastOrder {
  id: string;
  phone: string;
  placedAt: number;
  total?: number;
}

export const saveLastOrder = (order: LastOrder): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
  } catch {
    /* storage unavailable — the receipt link still carries the id */
  }
};

export const readLastOrder = (now = Date.now()): LastOrder | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastOrder> | null;
    if (
      !parsed ||
      typeof parsed.id !== "string" ||
      typeof parsed.phone !== "string" ||
      typeof parsed.placedAt !== "number"
    ) {
      return null;
    }
    if (now - parsed.placedAt > MAX_AGE_MS) {
      window.localStorage.removeItem(LAST_ORDER_KEY);
      return null;
    }
    return {
      id: parsed.id,
      phone: parsed.phone,
      placedAt: parsed.placedAt,
      total: typeof parsed.total === "number" ? parsed.total : undefined,
    };
  } catch {
    return null;
  }
};

export const clearLastOrder = (): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LAST_ORDER_KEY);
  } catch {
    /* ignore */
  }
};

/** `/track?id=PS-…&phone=017…` — the receipt's "track" link, prefilled. */
export const trackHref = (id: string, phone: string): string =>
  `/track?id=${encodeURIComponent(id)}&phone=${encodeURIComponent(phone)}`;
