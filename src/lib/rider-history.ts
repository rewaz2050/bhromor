/**
 * Rider trip history (Phase C): the pure half — the item shape, the cursor
 * parser, Dhaka-day grouping and the per-day totals the history screen shows.
 */

export interface RiderHistoryItem {
  /** Assignment id. */
  id: string;
  orderNo: string;
  outcome: "delivered" | "failed";
  /** Delivery time for delivered jobs; otherwise when the job was offered. */
  at: number;
  /** Cursor for the next page (the assignment's offered_at, ISO). */
  cursor: string;
  shopName: string;
  area: string;
  isReturn: boolean;
  payment: "cod" | "bkash" | "nagad";
  /** COD cash the rider collected on this trip (0 for wallet-paid / returns / failures). */
  cash: number;
  /** What this trip credited to the rider's wallet (fee + COD handling + tip + incentive). */
  earned: number;
  /** Why it failed — the rider's own words. */
  failedReason?: string;
}

export const HISTORY_PAGE = 30;

/** A cursor must be an ISO timestamp — anything else is dropped. */
export const parseHistoryCursor = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

const dayKey = (ts: number): string => new Date(ts + 6 * 3_600_000).toISOString().slice(0, 10);

export interface HistoryDay {
  day: string;
  items: RiderHistoryItem[];
  delivered: number;
  failed: number;
  earned: number;
  cash: number;
}

/** Group newest-first items by Dhaka calendar day (order preserved). */
export const groupHistoryByDay = (items: RiderHistoryItem[]): HistoryDay[] => {
  const days: HistoryDay[] = [];
  for (const item of items) {
    const key = dayKey(item.at);
    let day = days[days.length - 1];
    if (!day || day.day !== key) {
      day = { day: key, items: [], delivered: 0, failed: 0, earned: 0, cash: 0 };
      days.push(day);
    }
    day.items.push(item);
    if (item.outcome === "delivered") day.delivered += 1;
    else day.failed += 1;
    day.earned += item.earned;
    day.cash += item.cash;
  }
  return days;
};

/** "আজ" / "গতকাল" / "১২ সেপ্টেম্বর" for a Dhaka day key. */
export const historyDayLabel = (day: string, now: number = Date.now()): string => {
  const today = dayKey(now);
  if (day === today) return "আজ";
  if (day === dayKey(now - 86_400_000)) return "গতকাল";
  return new Date(`${day}T12:00:00+06:00`).toLocaleDateString("bn-BD", { day: "numeric", month: "long" });
};
