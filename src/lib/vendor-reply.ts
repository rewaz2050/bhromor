/**
 * B2 (2026-09-28) — the shop's reply to a review.
 *
 * Why this exists at all: a review is a shopper talking to strangers, and the
 * shop — the only party who can actually fix the thing they are complaining
 * about — had no way to answer on the page where everyone reads it. A reply
 * that says "sorry, we are remaking that sleeve, call 01…" converts the
 * complaint into evidence that the shop listens.
 *
 * Pure on purpose: the copy rules ("a reply is a sentence", "one reply per
 * review, editable — with the edit stamped") are the part that must not drift
 * between the API, the card and the test.
 */

import type { Review } from "./review-store";

/** Short enough to sit under a review, long enough to say something real. */
export const REPLY_MIN = 3;
export const REPLY_MAX = 1200;

export interface ReplyValidation {
  ok: boolean;
  error: string | null;
  /** Trimmed and clipped to REPLY_MAX — never longer than the column allows. */
  value: string;
}

/**
 * The reply body. An empty answer is refused (the shop should not post a blank
 * box); whitespace collapses at the ends only — an internal line break is the
 * shop's own formatting and is kept.
 */
export const validateVendorReply = (raw: unknown): ReplyValidation => {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text.length === 0) {
    return { ok: false, error: "Write the reply first.", value: "" };
  }
  if (text.length < REPLY_MIN) {
    return {
      ok: false,
      error: "Say a little more — one word is not an answer.",
      value: text,
    };
  }
  return { ok: true, error: null, value: text.slice(0, REPLY_MAX) };
};

/** The row's reply, or "" — one place decides what "no reply" looks like. */
export const replyBody = (review: Pick<Review, "vendorReply">): string =>
  (review.vendorReply ?? "").trim();

export const hasReply = (review: Pick<Review, "vendorReply">): boolean =>
  replyBody(review).length > 0;

/**
 * When the reply was last written, as epoch ms — null when the shop has not
 * answered. The API stamps every write (the database sets the clock), so the
 * card can honestly say "answered 2 days ago" without pretending to know how
 * many times the shop reworded it.
 */
export const replyStamp = (
  review: Pick<Review, "vendorReplyAt">,
): number | null =>
  typeof review.vendorReplyAt === "number" && review.vendorReplyAt > 0
    ? review.vendorReplyAt
    : null;

export interface ReplySummary {
  /** Approved reviews the shop has (the ones customers can read). */
  total: number;
  replied: number;
  unanswered: number;
  /** Average rating of the reviews still waiting for an answer; null when none. */
  unansweredRating: number | null;
}

/**
 * The card's headline numbers. Unanswered reviews are ordered by the caller —
 * this only counts, and deliberately reports the AVERAGE of the unanswered
 * ones: a shop with a 2-star review nobody answered should see that number,
 * not a comfortable overall average.
 */
export const replySummary = (
  reviews: Pick<Review, "rating" | "vendorReply">[],
): ReplySummary => {
  const unanswered = reviews.filter((r) => !hasReply(r));
  return {
    total: reviews.length,
    replied: reviews.length - unanswered.length,
    unanswered: unanswered.length,
    unansweredRating:
      unanswered.length === 0
        ? null
        : Math.round(
            (unanswered.reduce((sum, r) => sum + r.rating, 0) / unanswered.length) * 10,
          ) / 10,
  };
};

/** Oldest first among the waiting ones: the oldest complaint is the loudest. */
export const sortForReply = <T extends Pick<Review, "vendorReply" | "date">>(
  reviews: T[],
): T[] =>
  [...reviews].sort((a, b) => {
    const aWaiting = hasReply(a) ? 1 : 0;
    const bWaiting = hasReply(b) ? 1 : 0;
    if (aWaiting !== bWaiting) return aWaiting - bWaiting;
    return aWaiting === 0 ? a.date - b.date : b.date - a.date;
  });
