/**
 * The owner's morning digest — **pure**, so the numbers and the sentence that
 * carries them can be pinned by tests without booting a database.
 *
 * This is the answer to "the panel has to be opened to know anything": one
 * Web Push at 9am Dhaka with yesterday's takings, what is still open, and the
 * three things that are quietly piling up (late deliveries, low stock,
 * shoppers waiting on a price or a restock). Every line is a number the shop
 * can act on today, and a quiet day says so instead of inventing cheer.
 *
 * Bangla only: this goes to the staff inbox (`notifyStaff`), and the shop
 * reads Bangla — unlike the shopper copy, there is no second audience.
 */

import { formatBdt } from "./format";

export interface DigestStats {
  /** Orders placed on the previous Dhaka day (cancellations excluded). */
  yesterdayOrders: number;
  /** Revenue of those orders, in paisa (§69). */
  yesterdayRevenuePaisa: number;
  /** Orders placed since midnight Dhaka. */
  todayOrders: number;
  /** Anything not yet delivered or cancelled. */
  openOrders: number;
  /** Active + in-stock products flagged low. */
  lowStock: number;
  /** Price watches + stock watches still waiting for news. */
  waitingWatches: number;
  /** Orders promised for today (a delivery slot in the Dhaka day). */
  scheduledToday: number;
}

export const digestTitle = (): string => "সকালের হিসাব ☀️";

/** Where the tap lands: the dashboard, which is where a number gets acted on. */
export const digestHref = (): string => "/admin";

export const digestLines = (stats: DigestStats): string[] => {
  const lines: string[] = [];
  lines.push(
    stats.yesterdayOrders === 0
      ? "গতকাল কোনো অর্ডার আসেনি 😴"
      : `গতকাল ${stats.yesterdayOrders}টি অর্ডার · ${formatBdt(stats.yesterdayRevenuePaisa)}`,
  );
  lines.push(
    stats.openOrders === 0
      ? `আজ এখনো ${stats.todayOrders}টি অর্ডার · খোলা কিছু নেই ✅`
      : `আজ এখনো ${stats.todayOrders}টি অর্ডার · খোলা ${stats.openOrders}টি`,
  );
  if (stats.scheduledToday > 0) {
    lines.push(`আজ ${stats.scheduledToday}টি সময়-নির্ধারিত ডেলিভারি 🛵`);
  }
  const pile: string[] = [];
  if (stats.lowStock > 0) pile.push(`স্টক কম ${stats.lowStock}টি পণ্য`);
  if (stats.waitingWatches > 0) pile.push(`${stats.waitingWatches} জন দাম/স্টক অপেক্ষায়`);
  if (pile.length > 0) lines.push(pile.join(" · "));
  return lines;
};

export const digestBody = (stats: DigestStats): string => digestLines(stats).join("\n");
