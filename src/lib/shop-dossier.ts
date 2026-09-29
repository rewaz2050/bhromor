/**
 * C3 (2026-09-29) — what a shop's file MEANS, decided in one pure place.
 *
 * A detail page that only lists numbers makes staff do the arithmetic in
 * their heads at 11pm. These rules turn the file into three answers: what
 * needs doing, what the shop is worth, and what shoppers think.
 *
 * Pure: no clock inside (callers pass `now`), no database, no network — so the
 * rules can be tested against every awkward shop there is.
 */

import type { AdminShopDetail } from "@/lib/db/admin-shop";
import type { TranslationKey } from "@/lib/translations";
import { isShopOrderable, shopClosedCopy } from "@/lib/shop-utils";
import {
  vacationDaysLeft,
  vacationPhase,
  vacationRangeLabel,
  vacationReopenDate,
} from "@/lib/shop-vacation";

export type AttentionTone = "stop" | "warn" | "note";

export interface AttentionFlag {
  id:
    | "pending-application"
    | "suspended"
    | "no-zone"
    | "nothing-published"
    | "on-holiday"
    | "closed-now"
    | "not-verified"
    | "no-owner-login"
    | "balance-due"
    | "reviews-waiting";
  tone: AttentionTone;
  text: string;
  /** Where staff go to fix it, when there is somewhere. */
  href?: string;
}

/** A balance older than this is a promise the shop has started asking about. */
export const BALANCE_DUE_AFTER_DAYS = 14;
const DAY_MS = 86_400_000;

/**
 * Everything that is wrong (or worth knowing) about this shop, worst first.
 * The page shows these at the top: a shop with a problem must not read like a
 * healthy one with a long page.
 */
export const attentionFlags = (
  detail: AdminShopDetail,
  now: number = Date.now(),
  t: (key: TranslationKey) => string = (key) => key,
): AttentionFlag[] => {
  const { shop, catalog, ledger, reviews, staff } = detail;
  const flags: AttentionFlag[] = [];

  if (shop.status === "pending") {
    flags.push({
      id: "pending-application",
      tone: "stop",
      text: "Application is waiting — approve it or say no, the shop cannot open until then.",
    });
  }
  if (shop.status === "suspended" || shop.status === "rejected") {
    flags.push({
      id: "suspended",
      tone: "stop",
      text: `This shop is ${shop.status}${shop.review?.note ? ` — ${shop.review.note}` : ""}.`,
    });
  }
  if (shop.status === "active" && shop.zoneIds.length === 0) {
    flags.push({
      id: "no-zone",
      tone: "stop",
      text: "No delivery zone — orders cannot arrive.",
    });
  }
  if (shop.status === "active" && catalog.published === 0) {
    flags.push({
      id: "nothing-published",
      tone: "warn",
      text:
        catalog.total === 0
          ? "Nothing listed yet — the shop is invisible on the storefront."
          : `${catalog.total} product${catalog.total === 1 ? "" : "s"} saved, none published.`,
    });
  }

  // B6 — a holiday is not a fault to fix, it is a date to know. Two shapes:
  // the shop is away right now (say when it is back), or it has booked one
  // (say when it will close, so a "why is it closed?" call is never a surprise).
  const phase = vacationPhase(shop.vacation, now);
  const reopen = vacationReopenDate(shop.vacation, now);
  if (phase === "active" && reopen) {
    flags.push({
      id: "on-holiday",
      tone: "note",
      text: `On holiday — taking orders again ${reopen}${
        vacationDaysLeft(shop.vacation, now) > 0
          ? ` (${vacationDaysLeft(shop.vacation, now)} days)`
          : " (last day)"
      }.`,
    });
  } else if (phase === "scheduled" && shop.vacation?.start && shop.vacation?.end) {
    flags.push({
      id: "on-holiday",
      tone: "note",
      text: `Holiday booked ${vacationRangeLabel(shop.vacation)} — the shop closes then and reopens on its own.`,
    });
  } else if (shop.status === "active" && !isShopOrderable(shop, now)) {
    flags.push({
      id: "closed-now",
      tone: "warn",
      text: shopClosedCopy(shop, t, now).text,
    });
  }

  // B5 — the badge is a promise to shoppers; a shop without it is not in
  // trouble, it simply has not handed over its papers yet.
  if (shop.status === "active" && !shop.verification?.nid && !shop.verification?.tradeLicence) {
    flags.push({
      id: "not-verified",
      tone: "note",
      text: "Not verified — no NID or trade licence on file.",
      href: `/admin/shops/${shop.id}`,
    });
  }

  // C1 — without an owner login the shop cannot do anything for itself, and
  // every small change becomes a phone call to us.
  if (shop.status === "active" && !staff.some((s) => s.role === "owner")) {
    flags.push({
      id: "no-owner-login",
      tone: "warn",
      text: "No owner login linked — the shop cannot sign in.",
    });
  }

  if (ledger.balance > 0) {
    const ageDays =
      ledger.lastPayoutAt === null
        ? null
        : Math.floor((now - ledger.lastPayoutAt) / DAY_MS);
    if (ageDays === null || ageDays >= BALANCE_DUE_AFTER_DAYS) {
      flags.push({
        id: "balance-due",
        tone: ageDays !== null && ageDays >= BALANCE_DUE_AFTER_DAYS * 2 ? "warn" : "note",
        text:
          ageDays === null
            ? "Money is owed and nothing has ever been paid out."
            : `Money is owed — the last payout was ${ageDays} days ago.`,
        href: "/admin/payouts",
      });
    }
  }

  if (reviews.pending > 0) {
    flags.push({
      id: "reviews-waiting",
      tone: "note",
      text: `${reviews.pending} review${reviews.pending === 1 ? "" : "s"} waiting on moderation.`,
      href: "/admin/reviews",
    });
  }

  const rank: Record<AttentionTone, number> = { stop: 0, warn: 1, note: 2 };
  return flags.sort((a, b) => rank[a.tone] - rank[b.tone]);
};

export interface DossierHeadline {
  revenue: number;
  orders: number;
  openOrders: number;
  balance: number;
  rating: number | null;
  reviewCount: number;
  /** Shoppers' money the shop has actually earned (payable, not gross). */
  earned: number;
}

/** The four numbers the page leads with — the ones staff get asked for. */
export const dossierHeadline = (detail: AdminShopDetail): DossierHeadline => ({
  revenue: detail.orders.revenue,
  orders: detail.orders.count,
  openOrders: detail.orders.open,
  balance: detail.ledger.balance,
  rating: detail.reviews.count > 0 ? detail.reviews.average : null,
  reviewCount: detail.reviews.count,
  earned: detail.ledger.earned,
});

/** How long the shop has been on PROSANTI, in whole days (null if unknown). */
export const shopAgeDays = (createdAt: number | null | undefined, now: number): number | null =>
  typeof createdAt === "number" && Number.isFinite(createdAt)
    ? Math.max(0, Math.floor((now - createdAt) / DAY_MS))
    : null;
