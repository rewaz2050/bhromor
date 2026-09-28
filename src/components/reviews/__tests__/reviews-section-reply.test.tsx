/**
 * B2 (2026-09-28) — the shop's reply is PUBLIC.
 *
 * The reply lives on /vendor but its whole reason to exist is the product page:
 * a complaint with the shop's answer under it ("sleeve fixed, sorry") is worth
 * more to the next buyer than the complaint alone. This pins that the block
 * renders for a review that has one, and stays absent for the shops that have
 * not answered (never an empty "Response from the shop" box).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ReviewsSection from "@/components/reviews/reviews-section";
import { PRODUCTS } from "@/lib/catalog";
import type { Review } from "@/lib/review-store";

const product = PRODUCTS[0];

const { state } = vi.hoisted(() => ({ state: { reviews: [] as Review[] } }));

vi.mock("@/lib/use-public-reviews", () => ({
  usePublicReviews: () => ({
    reviews: state.reviews,
    submit: vi.fn(async () => true),
    live: true,
    loading: false,
    error: null,
  }),
}));

vi.mock("@/lib/use-public-settings", () => ({
  usePublicSettings: () => ({ settings: {}, loading: false }),
}));

const review = (over: Partial<Review> = {}): Review => ({
  id: over.id ?? "r1",
  productId: product.id,
  rating: 4,
  author: "Rima",
  body: "Fabric is lovely, sleeve is short.",
  date: Date.parse("2026-09-20T10:00:00Z"),
  status: "approved",
  verified: true,
  ...over,
});

beforeEach(() => {
  state.reviews = [review()];
});

afterEach(() => {
  cleanup();
  state.reviews = [];
});

describe("ReviewsSection — the shop's reply (B2)", () => {
  it("shows the shop's answer under the review it answers", () => {
    state.reviews = [
      review({ vendorReply: "Sorry about the sleeve — we are remaking it.", vendorReplyAt: 1 }),
    ];
    render(<ReviewsSection product={product} />);
    const block = screen.getByTestId("review-shop-reply");
    expect(block).toHaveTextContent("Response from the shop");
    expect(block).toHaveTextContent("Sorry about the sleeve — we are remaking it.");
  });

  it("shows nothing extra when the shop has not answered", () => {
    render(<ReviewsSection product={product} />);
    expect(screen.queryByTestId("review-shop-reply")).toBeNull();
  });

  it("treats a whitespace-only reply as no reply at all", () => {
    state.reviews = [review({ vendorReply: "   " })];
    render(<ReviewsSection product={product} />);
    expect(screen.queryByTestId("review-shop-reply")).toBeNull();
  });
});
