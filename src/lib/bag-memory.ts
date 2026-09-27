/**
 * "Your bag is waiting" memory (UX plan §5, R10) — pure helpers shared by
 * the silent sync in the layout and the banner on the home page.
 *
 * `touchedAt` is written on this device whenever the bag's contents change,
 * so a shopper who comes back later sees a soft "২টি পিস অপেক্ষা করছে →"
 * banner — not one who added a piece thirty seconds ago and tapped Home.
 */

export const BAG_TOUCHED_KEY = "prosanti.bag-touched.v1";
export const BAG_BANNER_DISMISSED_KEY = "prosanti.bag-banner-dismissed.v1";
/** The banner appears only when the bag has sat untouched this long. */
export const BAG_BANNER_AFTER_MS = 30 * 60 * 1000;

/** A stable fingerprint of the bag — same lines, same qty → same key. */
export const bagSignature = (lines: { productId: string; variantLabel: string; qty: number }[]): string =>
  lines
    .map((l) => `${l.productId}|${l.variantLabel}|${l.qty}`)
    .sort()
    .join(",");

export const readBagTouched = (): number | null => {
  try {
    const raw = window.localStorage.getItem(BAG_TOUCHED_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
};

export const writeBagTouched = (at: number): void => {
  try {
    window.localStorage.setItem(BAG_TOUCHED_KEY, String(at));
  } catch {
    /* storage unavailable — the banner simply never shows */
  }
};

/** Decide the banner, given what the device remembers. Pure for tests. */
export const shouldShowBagBanner = (input: {
  itemCount: number;
  touchedAt: number | null;
  dismissedFor: string | null;
  signature: string;
  now?: number;
}): boolean => {
  if (input.itemCount <= 0) return false;
  if (input.touchedAt === null) return false;
  if (input.dismissedFor !== null && input.dismissedFor === input.signature) return false;
  const now = input.now ?? Date.now();
  return now - input.touchedAt >= BAG_BANNER_AFTER_MS;
};
