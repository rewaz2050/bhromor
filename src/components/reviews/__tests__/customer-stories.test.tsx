import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import CustomerStories, { approvedStories } from "../customer-stories";
import type { Review } from "@/lib/review-store";
import { PRODUCTS } from "@/lib/catalog";
const { state } = vi.hoisted(() => ({ state: { reviews: [] as Review[] } }));
vi.mock("@/lib/use-reviews", () => ({ useReviews: () => state }));
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
  it("calculates the aggregate and labels samples, not verified proof", async () => {
    state.reviews = [review, { ...review, id: "two", rating: 2 }];
    render(<CustomerStories />);
    await waitFor(() =>
      expect(
        screen.getByText(/Across 2 approved demo reviews/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/3.0/)).toBeInTheDocument();
    expect(screen.getByText(/not verified customer proof/)).toBeInTheDocument();
    expect(screen.queryByText("Verified Customer")).not.toBeInTheDocument();
  });
  it("does not show a fabricated average when there are no reviews", async () => {
    render(<CustomerStories />);
    await waitFor(() =>
      expect(
        screen.getByText("Your story could be the first."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText(/approved demo reviews/)).not.toBeInTheDocument();
  });
});
