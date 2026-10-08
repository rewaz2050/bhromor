/**
 * Reviews & ratings (§30) — types and pure helpers.
 *
 * Customers submit reviews on the product page; the admin queue moderates
 * them (approve / hide / flag / feature / delete). Only approved reviews
 * appear on the storefront. `verified` marks purchases the system can prove
 * from the order records.
 */

import type { FitKey } from "./review-fit";

export type ReviewStatus = "pending" | "approved" | "hidden" | "flagged";

export interface Review {
  id: string;
  productId: string;
  rating: number; // 1..5
  author: string;
  title?: string;
  body: string;
  date: number; // epoch ms
  status: ReviewStatus;
  verified: boolean;
  featured?: boolean;
  /** Owning shop, denormalized for shop ratings (marketplace slice 1). */
  shopId?: string;
  /**
   * Customer photos (P1 #10 UGC), at most 3 — a garment on a real body is
   * the strongest fit signal in the whole shop. Cloudinary URLs when the
   * image service is configured, compressed JPEG data URLs at launch scale.
   * Absent/empty for reviews without photos.
   */
  photos?: string[];
  /**
   * B2 (2026-09-28) — the shop's public answer, written from /vendor. One
   * reply per review; the shop may reword it and the stamp moves with the
   * edit (the database sets that clock). Absent = the shop has not answered.
   */
  vendorReply?: string;
  /** Epoch ms of the last reply write (absent with no reply). */
  vendorReplyAt?: number;
  /** Which vendor account wrote it — audit trail for staff-run shops. */
  vendorReplyBy?: string;
  /**
   * Fit answer (fit-data pass 2026-10-06) — one tap on the review form:
   * "runs small" / "true to size" / "runs large". The strongest fit signal a
   * cloth shop can show, and the data the product page's true-to-size bar
   * was waiting for. Absent before migration 202610060001.
   */
  fit?: FitKey;
}

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  hidden: "Hidden",
  flagged: "Flagged",
};

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

export const approveReview = (r: Review): Review =>
  r.status === "approved" ? r : { ...r, status: "approved" };

export const setReviewStatus = (
  r: Review,
  status: ReviewStatus,
): Review => ({ ...r, status });

export const toggleReviewFeatured = (r: Review): Review => ({
  ...r,
  featured: !r.featured,
});

/** Change a review in the list (by id); append when new. */
export const upsertReview = (list: Review[], review: Review): Review[] => {
  const i = list.findIndex((r) => r.id === review.id);
  if (i === -1) return [review, ...list];
  const next = [...list];
  next[i] = review;
  return next;
};

export const removeReview = (list: Review[], id: string): Review[] =>
  list.filter((r) => r.id !== id);

export const updateReviewInList = (
  list: Review[],
  id: string,
  fn: (r: Review) => Review,
): Review[] =>
  list.map((r) => (r.id === id ? fn(r) : r));

/** Storefront view: approved only, featured first, newest first. */
/** 1 when the review carries at least one buyer photo — photo reviews rank first (UX plan §4, R9). */
export const hasPhotos = (r: Review): number => (Array.isArray(r.photos) && r.photos.length > 0 ? 1 : 0);

export const visibleReviews = (list: Review[], productId: string): Review[] =>
  list
    .filter((r) => r.productId === productId && r.status === "approved")
    .sort(
      (a, b) =>
        Number(Boolean(b.featured)) - Number(Boolean(a.featured)) ||
        hasPhotos(b) - hasPhotos(a) ||
        b.date - a.date,
    );

export const visibleCount = (list: Review[], productId: string): number =>
  list.filter((r) => r.productId === productId && r.status === "approved").length;

export const averageOf = (list: Review[]): number => {
  if (list.length === 0) return 0;
  const sum = list.reduce((s, r) => s + r.rating, 0);
  return Math.round((sum / list.length) * 10) / 10;
};

export const statusCounts = (list: Review[]): Record<ReviewStatus, number> => ({
  pending: list.filter((r) => r.status === "pending").length,
  approved: list.filter((r) => r.status === "approved").length,
  hidden: list.filter((r) => r.status === "hidden").length,
  flagged: list.filter((r) => r.status === "flagged").length,
});
