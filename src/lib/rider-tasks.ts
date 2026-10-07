/**
 * The rider board's pure view-model (item Z, split out of `rider/page.tsx`).
 * No React, no I/O — everything here is unit-tested directly.
 */
import type { Order } from "./orders";
import type { RiderJob } from "./db/riders";
import { formatBdt } from "./format";
import type { Language } from "./translations";

export interface RiderTask {
  /** Identifier of the action target — the live assignment id. */
  id: string;
  order: Order;
  state: "offered" | "accepted" | "picked_up" | "delivered";
  /** When an OFFER lapses (epoch ms) — the rider has until then to accept. */
  expiresAt: number;
  pickupShop?: RiderJob["pickupShop"];
}

/** Seconds left on an offer, never negative. */
export const secondsLeft = (expiresAt: number, now: number): number =>
  Math.max(0, Math.ceil((expiresAt - now) / 1000));

/**
 * Jobs the rider still has to act on. Delivered / cancelled / expired work is
 * gone, and a job that ended as a final failed attempt is closed too: the rider
 * only has to return the parcel to the shop.
 */
export const toRiderTasks = (jobs: readonly RiderJob[]): RiderTask[] =>
  jobs
    .filter((job) => job.state !== "delivered" && job.state !== "cancelled" && job.state !== "expired" && job.state !== "failed")
    .map((job) => ({
      id: job.id,
      order: job.order,
      state: job.state === "offered" ? "offered" : job.state === "picked_up" ? "picked_up" : "accepted",
      expiresAt: job.expiresAt,
      pickupShop: job.pickupShop,
    }));

/** Unaccepted invitations are not trips: "চলমান" counts only work this rider holds. */
export const countActiveTrips = (tasks: readonly RiderTask[]): number => tasks.filter((t) => t.state !== "offered").length;

export const offeredIds = (tasks: readonly RiderTask[]): string[] => tasks.filter((t) => t.state === "offered").map((t) => t.id);

/** Amber from ৳3,000 (a fixed warning band), red once the admin-set cap is hit. */
export const CASH_WARN_PAISA = 300000;

export interface CashMeter {
  reached: boolean;
  /** 0–100 */
  percent: number;
  tone: "rose" | "amber" | "emerald";
}

export const cashMeter = (cashInHand: number, limit: number): CashMeter => {
  const reached = cashInHand >= limit;
  return {
    reached,
    percent: Math.min(100, Math.round((cashInHand / limit) * 100)),
    tone: reached ? "rose" : cashInHand > CASH_WARN_PAISA ? "amber" : "emerald",
  };
};

/**
 * Going offline with the shop's cash in your pocket (vendor + rider pass,
 * 2026-10-07).
 *
 * Nothing on the board said it: a rider could switch off after a COD day and
 * ride home with ৳3,000 of the platform's money still in their pocket — no
 * warning, no nudge, just a quiet toggle. This is the sentence the board
 * says before it lets that happen. Null when there is nothing to hand over,
 * so a rider with an empty pocket is never nagged.
 */
export const offlineCashNote = (
  cashInHand: number,
  lang: Language = "bn",
): string | null => {
  if (cashInHand <= 0) return null;
  return lang === "bn"
    ? `হাতে ${formatBdt(cashInHand)} ক্যাশ আছে — অফলাইন যাওয়ার আগে জমা দিয়ে যান।`
    : `You are holding ${formatBdt(cashInHand)} in COD cash — settle before going offline.`;
};
