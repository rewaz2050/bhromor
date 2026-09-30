/**
 * B2 (2026-09-28) — the shop's public reply, as rules rather than prose.
 *
 * The three that matter: a blank or one-word answer is refused (the review
 * page is public), a long answer is clipped to what the column can hold, and
 * the card's headline counts unanswered reviews honestly — including the
 * average of the ones nobody has answered yet, because that is the number a
 * shop should feel.
 */
import { describe, expect, it } from "vitest";
import {
  REPLY_MAX,
  hasReply,
  replyBody,
  replyStamp,
  replySummary,
  sortForReply,
  validateVendorReply,
} from "@/lib/vendor-reply";
import type { Review } from "@/lib/review-store";

const review = (over: Partial<Review> = {}): Review => ({
  id: over.id ?? "r1",
  productId: "p1",
  rating: over.rating ?? 4,
  author: "Rima",
  body: "Good fabric, a little long.",
  date: over.date ?? Date.parse("2026-09-20T10:00:00Z"),
  status: "approved",
  verified: true,
  ...over,
});

describe("validateVendorReply", () => {
  it("accepts a real answer and trims the edges", () => {
    const checked = validateVendorReply("  ধন্যবাদ — হাতা আমরা ঠিক করে দিচ্ছি।  ");
    expect(checked.ok).toBe(true);
    expect(checked.error).toBeNull();
    expect(checked.value).toBe("ধন্যবাদ — হাতা আমরা ঠিক করে দিচ্ছি।");
  });

  it("refuses an empty or one-word answer", () => {
    expect(validateVendorReply("").ok).toBe(false);
    expect(validateVendorReply("   ").error).toMatch(/write the reply/i);
    expect(validateVendorReply("thanks").ok).toBe(true);
    expect(validateVendorReply("ok").ok).toBe(false);
    expect(validateVendorReply("ok").error).toMatch(/little more/i);
  });

  it("never returns a value longer than the column allows", () => {
    const long = "ক".repeat(REPLY_MAX + 500);
    const checked = validateVendorReply(long);
    expect(checked.ok).toBe(true);
    expect(checked.value).toHaveLength(REPLY_MAX);
  });

  it("tolerates junk input (undefined, numbers, objects)", () => {
    for (const raw of [undefined, null, 7, {}, []]) {
      const checked = validateVendorReply(raw);
      expect(checked.ok).toBe(false);
      expect(checked.value).toBe("");
    }
  });
});

describe("reply state", () => {
  it("treats whitespace as no reply at all", () => {
    expect(hasReply(review({ vendorReply: "   " }))).toBe(false);
    expect(replyBody(review({ vendorReply: "  We fixed it.  " }))).toBe("We fixed it.");
    expect(hasReply(review({ vendorReply: "We fixed the sleeve." }))).toBe(true);
  });

  it("exposes the stamp only when the shop has answered", () => {
    expect(replyStamp(review())).toBeNull();
    expect(replyStamp(review({ vendorReplyAt: 0 }))).toBeNull();
    expect(replyStamp(review({ vendorReplyAt: 1759000000000 }))).toBe(1759000000000);
  });
});

describe("replySummary", () => {
  it("counts answered vs waiting, and the average of the waiting ones", () => {
    const summary = replySummary([
      review({ rating: 5, vendorReply: "Thank you!" }),
      review({ rating: 2 }),
      review({ rating: 3 }),
    ]);
    expect(summary).toEqual({
      total: 3,
      replied: 1,
      unanswered: 2,
      unansweredRating: 2.5,
    });
  });

  it("reports null (never 0) when nothing is answered or nothing is waiting", () => {
    expect(replySummary([])).toEqual({
      total: 0,
      replied: 0,
      unanswered: 0,
      unansweredRating: null,
    });
    expect(
      replySummary([review({ vendorReply: "ok, thanks!" })]).unansweredRating,
    ).toBeNull();
  });
});

describe("sortForReply", () => {
  it("puts the waiting reviews first, oldest complaint at the top", () => {
    const rows = [
      review({ id: "answered-new", date: 500, vendorReply: "Thanks" }),
      review({ id: "waiting-new", date: 400 }),
      review({ id: "answered-old", date: 100, vendorReply: "Thanks" }),
      review({ id: "waiting-old", date: 200 }),
    ];
    expect(sortForReply(rows).map((r) => r.id)).toEqual([
      "waiting-old",
      "waiting-new",
      "answered-new",
      "answered-old",
    ]);
  });
});
