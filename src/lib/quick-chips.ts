/**
 * Home quick chips (UX plan §2, R11) — "৳৫০০-এর নিচে · উৎসবের জন্য · উপহার ·
 * আজই হাতে · ছাড়ে · নতুন": one tap from the first screen into the shop,
 * already filtered. Pure: the same predicates the /shop URL state applies
 * (`lib/shop-url`, `lib/merchandising`), so the count on the chip is the
 * count the shopper lands on. A chip with fewer than 2 pieces is not shown;
 * a row with fewer than 2 chips is not shown at all.
 */

import type { Product } from "./catalog";
import { bdt } from "./format";
import { isDiscoverable, isOnOffer, matchesMood } from "./merchandising";

export type QuickChipId = "under500" | "festive" | "gift" | "today" | "sale" | "new";

export interface QuickChipDef {
  id: QuickChipId;
  /** Shop URL with the filter state pre-applied (same keys as /shop reads). */
  href: string;
  en: string;
  bn: string;
  match: (p: Product) => boolean;
}

const live = (p: Product): boolean => isDiscoverable(p) && p.inStock;

export const QUICK_CHIP_DEFS: readonly QuickChipDef[] = [
  {
    id: "under500",
    href: "/shop?price=under500&stock=1",
    en: "Under ৳500",
    bn: "৳৫০০-এর নিচে",
    match: (p) => live(p) && p.price < bdt(500),
  },
  {
    id: "festive",
    href: "/shop?mood=festive&stock=1",
    en: "For the festivities",
    bn: "উৎসবের জন্য",
    match: (p) => live(p) && matchesMood(p, "festive"),
  },
  {
    id: "gift",
    href: "/shop?price=under1000&sort=best&stock=1",
    en: "Gifts under ৳1,000",
    bn: "উপহার, ৳১,০০০-এর মধ্যে",
    match: (p) => live(p) && p.price < bdt(1000),
  },
  {
    id: "today",
    href: "/shop?stock=1",
    en: "Need it today",
    bn: "আজই হাতে",
    match: live,
  },
  {
    id: "sale",
    href: "/shop?filter=sale&stock=1",
    en: "On sale",
    bn: "ছাড়ে",
    match: (p) => live(p) && isOnOffer(p),
  },
  {
    id: "new",
    href: "/shop?filter=new&stock=1",
    en: "New in",
    bn: "নতুন",
    match: (p) => live(p) && p.isNew,
  },
];

export const MIN_CHIP_PIECES = 2;
export const MIN_CHIPS = 2;

export interface QuickChip extends QuickChipDef {
  count: number;
}

/** The chips worth showing for this pool, in editorial order, with honest counts. */
export const quickChips = (pool: readonly Product[]): QuickChip[] => {
  const out: QuickChip[] = [];
  for (const def of QUICK_CHIP_DEFS) {
    const count = pool.reduce((n, p) => (def.match(p) ? n + 1 : n), 0);
    if (count >= MIN_CHIP_PIECES) out.push({ ...def, count });
  }
  return out.length >= MIN_CHIPS ? out : [];
};
