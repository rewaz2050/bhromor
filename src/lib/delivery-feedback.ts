/**
 * Delivery feedback (item X, 202610020009) — the pure half: the quick-reason
 * tags, input cleaning, the "does staff need to hear about this now" rule and
 * the one-line summaries. The database reads/writes are in
 * `db/delivery-feedback.ts`.
 */

export const NEGATIVE_TAGS = ["late", "rude", "careless", "wrong_order", "unreachable"] as const;
export const POSITIVE_TAGS = ["polite", "fast", "careful"] as const;
export const FEEDBACK_TAGS = [...NEGATIVE_TAGS, ...POSITIVE_TAGS] as const;
export type FeedbackTag = (typeof FEEDBACK_TAGS)[number];

export const MAX_COMMENT = 500;
export const MAX_TAGS = 5;
/** 1–2 stars: staff are told at once. */
export const LOW_STARS = 2;

export const TAG_LABEL: Record<FeedbackTag, { bn: string; en: string }> = {
  late: { bn: "দেরিতে এসেছে", en: "Arrived late" },
  rude: { bn: "খারাপ ব্যবহার", en: "Rude" },
  careless: { bn: "অযত্নে হ্যান্ডেল", en: "Careless handling" },
  wrong_order: { bn: "ভুল/অসম্পূর্ণ অর্ডার", en: "Wrong or incomplete order" },
  unreachable: { bn: "ফোনে পাওয়া যায়নি", en: "Hard to reach" },
  polite: { bn: "ভদ্র ব্যবহার", en: "Polite" },
  fast: { bn: "দ্রুত", en: "Fast" },
  careful: { bn: "যত্ন নিয়ে", en: "Careful" },
};

export const isFeedbackTag = (v: unknown): v is FeedbackTag =>
  typeof v === "string" && (FEEDBACK_TAGS as readonly string[]).includes(v);

export const tagLabel = (tag: string, lang: "bn" | "en" = "en"): string =>
  isFeedbackTag(tag) ? TAG_LABEL[tag][lang] : tag;

export interface FeedbackInput {
  tags: FeedbackTag[];
  comment: string;
}

/** Unknown tags are dropped, duplicates collapsed, the comment trimmed and cut. Empty feedback is an error. */
export const parseFeedbackInput = (
  raw: { tags?: unknown; comment?: unknown } | null | undefined,
): { ok: true; input: FeedbackInput } | { ok: false; error: string } => {
  const tags: FeedbackTag[] = [];
  if (Array.isArray(raw?.tags)) {
    for (const t of raw.tags) if (isFeedbackTag(t) && !tags.includes(t)) tags.push(t);
  }
  const comment = typeof raw?.comment === "string" ? raw.comment.replace(/\s+/g, " ").trim().slice(0, MAX_COMMENT) : "";
  if (tags.length === 0 && comment === "") return { ok: false, error: "একটি কারণ বা কয়েকটি কথা লিখুন।" };
  return { ok: true, input: { tags: tags.slice(0, MAX_TAGS), comment } };
};

/** Staff should be told straight away: a low rating, or any complaint-type tag. */
export const needsStaffAttention = (stars: number, tags: readonly string[]): boolean =>
  stars <= LOW_STARS || tags.some((t) => (NEGATIVE_TAGS as readonly string[]).includes(t));

export interface StaffFeedbackRow {
  orderId: string;
  orderNo: string;
  riderId: string;
  riderName: string;
  stars: number;
  tags: string[];
  comment: string;
  hidden: boolean;
  at: number;
  /** Whether the customer left words/tags (a bare star rating has neither). */
  hasFeedback: boolean;
}

export const feedbackSummary = (r: Pick<StaffFeedbackRow, "tags" | "comment">): string =>
  [...r.tags.map((t) => tagLabel(t, "en")), r.comment ? `“${r.comment}”` : ""].filter(Boolean).join(" · ");

/** What the rider may see: not hidden, and only when there is something said. */
export interface RiderFeedbackRow {
  stars: number;
  at: number;
  orderNo?: string;
  tags: string[];
  comment: string;
}
