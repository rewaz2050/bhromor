import { describe, expect, it } from "vitest";
import {
  approveReview,
  averageOf,
  removeReview,
  setReviewStatus,
  statusCounts,
  toggleReviewFeatured,
  upsertReview,
  visibleCount,
  visibleReviews,
  type Review,
} from "../review-store";

const make = (over: Partial<Review> = {}): Review => ({
  id: "r1",
  productId: "p1",
  rating: 5,
  author: "Tester",
  body: "Really nice product, fabric feels premium and delivery was quick.",
  date: 1_700_000_000_000,
  status: "approved",
  verified: true,
  ...over,
});

describe("reviews (§30)", () => {
  it("moderates status and featured state immutably", () => {
    const r = make();
    expect(approveReview(make({ status: "pending" })).status).toBe("approved");
    expect(setReviewStatus(r, "hidden").status).toBe("hidden");
    expect(r.status).toBe("approved"); // untouched
    expect(toggleReviewFeatured(r).featured).toBe(true);
    expect(toggleReviewFeatured({ ...r, featured: true }).featured).toBe(false);
  });

  it("upserts new and replaces existing by id", () => {
    const a = make({ id: "r1" });
    const b = make({ id: "r2", rating: 4 });
    const list = upsertReview([a], b);
    expect(list).toHaveLength(2);
    const replaced = upsertReview(list, make({ id: "r1", rating: 2 }));
    expect(replaced).toHaveLength(2);
    expect(replaced.find((x) => x.id === "r1")!.rating).toBe(2);
  });

  it("removes by id", () => {
    const list = [make(), make({ id: "r2" })];
    expect(removeReview(list, "r1")).toHaveLength(1);
  });

  it("shows only approved reviews, featured first, newest first", () => {
    const list = [
      make({ id: "r-new", date: 2_000_000_000_000 }),
      make({ id: "r-feat", date: 1_000_000_000_000, featured: true }),
      make({ id: "r-pend", status: "pending" }),
      make({ id: "r-other", productId: "p2" }),
    ];
    const visible = visibleReviews(list, "p1");
    expect(visible.map((r) => r.id)).toEqual(["r-feat", "r-new"]);
    expect(visibleCount(list, "p1")).toBe(2);
  });

  it("ranks photo reviews ahead of text-only ones, after featured (UX plan §4)", () => {
    const list = [
      make({ id: "r-text-new", date: 3_000 }),
      make({ id: "r-photo-old", date: 1_000, photos: ["data:image/jpeg;base64,AAA"] }),
      make({ id: "r-feat-text", date: 500, featured: true }),
      make({ id: "r-photo-empty", date: 2_000, photos: [] }),
    ];
    expect(visibleReviews(list, "p1").map((r) => r.id)).toEqual([
      "r-feat-text",
      "r-photo-old",
      "r-text-new",
      "r-photo-empty",
    ]);
  });

  it("computes averages and status counts", () => {
    expect(averageOf([])).toBe(0);
    expect(averageOf([make({ rating: 5 }), make({ rating: 4 }), make({ rating: 5 })])).toBe(4.7);
    const counts = statusCounts([
      make(),
      make({ id: "r2", status: "pending" }),
      make({ id: "r3", status: "flagged" }),
      make({ id: "r4", status: "hidden" }),
    ]);
    expect(counts).toEqual({ pending: 1, approved: 1, hidden: 1, flagged: 1 });
  });
});
