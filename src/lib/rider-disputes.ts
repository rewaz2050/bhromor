/**
 * Item W — rider disputes and manual wallet adjustments. Pure and client-safe:
 * the vocabulary and the input rules shared by the rider form, the admin queue
 * and the API routes. Money crosses the wire in TAKA (what people type) and is
 * converted to paisa here, once.
 */

export const DISPUTE_CATEGORIES = [
  { id: "missing_fee", bn: "ডেলিভারি ফি পাইনি", en: "Delivery fee missing", needsTrip: true },
  { id: "wrong_cod", bn: "COD-র টাকা মিলছে না", en: "COD amount mismatch", needsTrip: true },
  { id: "missing_tip", bn: "টিপ পাইনি", en: "Tip missing", needsTrip: true },
  { id: "wrongly_failed", bn: "ভুলে 'ব্যর্থ' দেখানো হয়েছে", en: "Trip wrongly marked failed", needsTrip: true },
  { id: "other", bn: "অন্য কিছু", en: "Other", needsTrip: false },
] as const;

export type DisputeCategory = (typeof DISPUTE_CATEGORIES)[number]["id"];
export type DisputeStatus = "pending" | "approved" | "rejected";

export const isDisputeCategory = (v: unknown): v is DisputeCategory =>
  typeof v === "string" && DISPUTE_CATEGORIES.some((c) => c.id === v);

export const disputeCategoryLabel = (id: string, lang: "bn" | "en" = "bn"): string =>
  DISPUTE_CATEGORIES.find((c) => c.id === id)?.[lang] ?? id;

export const DISPUTE_MESSAGE = { min: 5, max: 500 } as const;
/** ৳50,000 in paisa — the same ceiling the SQL enforces. */
export const MAX_ADJUSTMENT_PAISA = 5_000_000;
export const MAX_OPEN_DISPUTES = 5;

/** What the rider sees. */
export interface RiderDispute {
  id: string;
  category: DisputeCategory | string;
  message: string;
  orderNo: string | null;
  claimedAmount: number | null;
  status: DisputeStatus;
  adjustmentAmount: number;
  note: string | null;
  at: number;
  decidedAt: number | null;
}

/** What staff see. */
export interface AdminDispute extends RiderDispute {
  riderId: string;
  riderName: string;
}

const takaToPaisa = (raw: unknown): number | null => {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

const UUID = /^[0-9a-f-]{36}$/i;

export interface RaiseInput {
  assignmentId: string | null;
  category: DisputeCategory;
  message: string;
  /** paisa */
  claimed: number | null;
}

export const parseRaiseInput = (raw: unknown): RaiseInput | { error: string } => {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!isDisputeCategory(b.category)) return { error: "সমস্যার ধরন বেছে নিন।" };
  const category = b.category;
  const message = typeof b.message === "string" ? b.message.trim() : "";
  if (message.length < DISPUTE_MESSAGE.min) return { error: "সমস্যাটি একটু বিস্তারিত লিখুন (কমপক্ষে ৫ অক্ষর)।" };
  if (message.length > DISPUTE_MESSAGE.max) return { error: `বার্তা ${DISPUTE_MESSAGE.max} অক্ষরের বেশি হতে পারবে না।` };
  const assignmentId = typeof b.assignmentId === "string" && b.assignmentId ? b.assignmentId : null;
  if (assignmentId && !UUID.test(assignmentId)) return { error: "ট্রিপটি চেনা যায়নি।" };
  const needsTrip = DISPUTE_CATEGORIES.find((c) => c.id === category)?.needsTrip === true;
  if (needsTrip && !assignmentId) return { error: "কোন ট্রিপ নিয়ে সমস্যা, সেটি বেছে নিন।" };
  let claimed: number | null = null;
  if (b.claimedTaka !== undefined && b.claimedTaka !== null && b.claimedTaka !== "") {
    claimed = takaToPaisa(b.claimedTaka);
    if (claimed === null || claimed < 0 || claimed > MAX_ADJUSTMENT_PAISA) return { error: "টাকার অঙ্ক সঠিক নয়।" };
  }
  return { assignmentId, category, message, claimed };
};

export interface ResolveInput {
  decision: "approve" | "reject";
  /** signed paisa; 0 = acknowledge without moving money */
  amount: number;
  note: string;
}

export const parseResolveInput = (raw: unknown): ResolveInput | { error: string } => {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (b.decision !== "approve" && b.decision !== "reject") return { error: "Choose approve or reject." };
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 400) : "";
  if (b.decision === "reject") {
    if (note.length < 3) return { error: "Give the rider a reason (a few words) — they read it." };
    return { decision: "reject", amount: 0, note };
  }
  let amount = 0;
  if (b.amountTaka !== undefined && b.amountTaka !== null && b.amountTaka !== "") {
    const p = takaToPaisa(b.amountTaka);
    if (p === null || Math.abs(p) > MAX_ADJUSTMENT_PAISA) return { error: "Amount must be a number up to ৳50,000." };
    amount = p;
  }
  if (amount !== 0 && note.length < 5) return { error: "Say why the wallet is being changed (at least a few words)." };
  return { decision: "approve", amount, note };
};

export interface AdjustInput {
  /** signed paisa, never 0 */
  amount: number;
  note: string;
}

export const parseAdjustInput = (raw: unknown): AdjustInput | { error: string } => {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const amount = takaToPaisa(b.amountTaka);
  if (amount === null || amount === 0) return { error: "Enter the amount in taka — positive to credit, negative to debit." };
  if (Math.abs(amount) > MAX_ADJUSTMENT_PAISA) return { error: "One adjustment can be at most ৳50,000." };
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 400) : "";
  if (note.length < 5) return { error: "A reason is required (at least a few words) — the rider and the audit log both show it." };
  return { amount, note };
};

const taka = (paisa: number): string => {
  const t = Math.abs(paisa) / 100;
  return `৳${Number.isInteger(t) ? t : t.toFixed(2)}`;
};

/** The note the rider reads in their inbox / push once staff decide. */
export const disputeDecisionMessage = (
  decision: "approve" | "reject",
  amount: number,
  note: string,
): { title: string; body: string } => {
  if (decision === "reject") {
    return { title: "আপনার অভিযোগের উত্তর", body: `অভিযোগটি গ্রহণ করা যায়নি। কারণ: ${note}` };
  }
  const money =
    amount > 0 ? `ওয়ালেটে ${taka(amount)} যোগ হয়েছে।` : amount < 0 ? `ওয়ালেট থেকে ${taka(amount)} কাটা হয়েছে।` : "";
  return { title: "আপনার অভিযোগ গৃহীত", body: [money, note].filter(Boolean).join(" ") || "অফিস অভিযোগটি দেখেছে।" };
};

/** Same wording for a manual adjustment staff make without a dispute. */
export const adjustmentMessage = (amount: number, note: string): { title: string; body: string } => ({
  title: amount > 0 ? "ওয়ালেটে টাকা যোগ হয়েছে" : "ওয়ালেট থেকে টাকা কাটা হয়েছে",
  body: `${amount > 0 ? "+" : "−"}${taka(amount)} — ${note}`,
});
