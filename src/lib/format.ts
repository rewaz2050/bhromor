/**
 * Money + formatting helpers.
 * Per the PROSANTI blueprint (§69) all amounts are integer minor units (paisa)
 * to avoid unsafe floating-point arithmetic. 149000 = ৳1,490.
 */

export type Bdt = number; // amount in paisa (৳1 = 100)

export const formatBdt = (amount: Bdt): string =>
  `৳${(amount / 100).toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;

export const formatPaisa = (amount: Bdt): string => {
  const taka = amount / 100;
  if (Number.isInteger(taka)) {
    return `৳${taka.toLocaleString("en-IN")}`;
  }
  return `৳${taka.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

export const bdt = (taka: number): Bdt => Math.round(taka * 100);

export const totalInPaisa = (amounts: Bdt[]): Bdt =>
  amounts.reduce((sum, value) => sum + value, 0);

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

/**
 * The shop's day. Every date the storefront prints is a Dhaka date — the
 * customers are in Sunamganj and the servers are not.
 *
 * Pinned here on purpose (flicker pass 2026-10-07): an unpinned
 * `toLocaleDateString` answers with the SERVER's zone during SSR (UTC on
 * Vercel) and the shopper's zone in the browser, so for six hours of every
 * Bangladeshi day the two disagree — the HTML says one date, hydration
 * paints another, and React tears the text out and repaints it. Pinning the
 * zone makes both sides print the same string, and makes the date correct
 * whether or not anything mismatched.
 */
export const SHOP_TIME_ZONE = "Asia/Dhaka";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

const shopFormatter = (
  locale: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat => {
  const key = `${locale}|${JSON.stringify(options)}`;
  let found = formatterCache.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(locale, { timeZone: SHOP_TIME_ZONE, ...options });
    formatterCache.set(key, found);
  }
  return found;
};

/**
 * A timestamp as the shop's own clock reads it. Takes epoch ms, an ISO
 * string or a Date — the backend hands back all three.
 */
export const formatShopDate = (
  at: number | string | Date,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
  locale = "en-GB",
): string => {
  const when = at instanceof Date ? at : new Date(at);
  return Number.isNaN(when.getTime()) ? "" : shopFormatter(locale, options).format(when);
};
