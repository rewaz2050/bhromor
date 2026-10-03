/**
 * The rider's cash pay-in timeline. Three things can be on it:
 *   • a PENDING claim — "I paid, waiting for the office"
 *   • a REJECTED claim — with the reason staff gave (it used to vanish)
 *   • a SETTLEMENT — cash/wallet netting the office has recorded (either an
 *     approved claim or one staff recorded directly)
 * An APPROVED claim is deliberately not a separate row: its settlement is.
 */

export interface TimelineSettlement {
  id: string;
  amount: number;
  method: string;
  reference: string;
  nettedAmount: number;
  at: number;
}

export interface TimelineClaim {
  id: string;
  amount: number;
  method: string;
  reference: string;
  status: "pending" | "approved" | "rejected";
  at: number;
  decidedAt?: number;
  note?: string;
}

export type CashTimelineItem = {
  id: string;
  kind: "pending" | "rejected" | "settled";
  amount: number;
  method: string;
  reference: string;
  nettedAmount: number;
  /** When it happened (settled/decided time for finished rows). */
  at: number;
  note?: string;
};

export const buildCashTimeline = (
  settlements: readonly TimelineSettlement[],
  claims: readonly TimelineClaim[],
  limit = 10,
): CashTimelineItem[] => {
  const items: CashTimelineItem[] = [];
  for (const s of settlements) {
    items.push({ id: `s-${s.id}`, kind: "settled", amount: s.amount, method: s.method, reference: s.reference, nettedAmount: s.nettedAmount, at: s.at });
  }
  for (const c of claims) {
    if (c.status === "approved") continue;
    items.push({
      id: `c-${c.id}`,
      kind: c.status === "pending" ? "pending" : "rejected",
      amount: c.amount,
      method: c.method,
      reference: c.reference,
      nettedAmount: 0,
      at: c.status === "rejected" ? (c.decidedAt ?? c.at) : c.at,
      note: c.note?.trim() || undefined,
    });
  }
  return items.sort((a, b) => b.at - a.at).slice(0, limit);
};

export const CASH_TIMELINE_LABEL: Record<CashTimelineItem["kind"], string> = {
  pending: "⏳ অনুমোদনের অপেক্ষায়",
  rejected: "✖ অনুমোদন হয়নি",
  settled: "✓ জমা হয়েছে",
};

/** What the rider should do / understand next, per state. */
export const cashTimelineHint = (item: CashTimelineItem): string => {
  if (item.kind === "pending") return "অফিস যাচাই করলে আপনার ক্যাশ ব্যালেন্স কমবে।";
  if (item.kind === "rejected")
    return `আপনার ক্যাশ ব্যালেন্স কমেনি।${item.note ? ` কারণ: ${item.note}।` : ""} টাকা জমা দিয়ে থাকলে সঠিক reference সহ আবার দাবি করুন বা অফিসে যোগাযোগ করুন।`;
  return "";
};
