import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CustomerStories, { approvedStories } from "../customer-stories";
import type { Review } from "@/lib/review-store";
import { PRODUCTS } from "@/lib/catalog";

const { state } = vi.hoisted(() => ({ state: { reviews: [] as Review[] } }));

vi.mock("@/lib/use-public-reviews", () => ({
  usePublicReviews: () => ({
    reviews: state.reviews,
    submit: vi.fn(),
    live: true,
    loading: false,
    error: null,
  }),
}));

afterEach(() => {
  cleanup();
  state.reviews = [];
});

const review: Review = {
  id: "test",
  productId: PRODUCTS[0].id,
  rating: 4,
  body: "Sample review body",
  author: "Sample author",
  date: 1,
  status: "approved",
  verified: true,
};

describe("Customer stories preview", () => {
  it("only includes approved valid reviews of discoverable products", () => {
    expect(
      approvedStories([
        review,
        { ...review, status: "pending" },
        { ...review, status: "hidden" },
        { ...review, status: "flagged" },
        { ...review, rating: NaN },
        { ...review, productId: "missing" },
      ]),
    ).toEqual([review]);
  });

  it("calculates the aggregate from approved reviews only", () => {
    state.reviews = [review, { ...review, id: "two", rating: 2 }];
    render(<CustomerStories />);

    expect(
      screen.getByText(/Across 2 approved reviews/),
    ).toBeInTheDocument();
    expect(screen.getByText(/3\.0/)).toBeInTheDocument();
    // verified: true renders the purchase marker, not a blanket claim.
    expect(screen.getAllByText(/Verified purchase/)).toHaveLength(2);
  });

  it("does not show a fabricated average when there are no reviews", () => {
    render(<CustomerStories />);

    expect(screen.getByText("Your story could be the first.")).toBeInTheDocument();
    expect(
      screen.queryByText(/Across \d+ approved reviews/),
    ).not.toBeInTheDocument();
  });
});
