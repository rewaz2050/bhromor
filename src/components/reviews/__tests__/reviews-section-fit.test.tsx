/**
 * Fit data (2026-10-06): the one-tap answer on the form, and the bar it
 * feeds on the product page — which stays away until there are enough
 * approved answers to mean anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ReviewsSection from "@/components/reviews/reviews-section";
import { PRODUCTS } from "@/lib/catalog";
import type { Review } from "@/lib/review-store";
import type { FitKey } from "@/lib/review-fit";

const product = PRODUCTS[0];

const { state } = vi.hoisted(() => ({
  state: {
    reviews: [] as Review[],
    submit: vi.fn(async (input: unknown) => ({ ok: true, input })),
  },
}));

vi.mock("@/lib/use-public-reviews", () => ({
  usePublicReviews: () => ({
    reviews: state.reviews,
    submit: state.submit,
    live: true,
    loading: false,
    error: null,
  }),
}));

vi.mock("@/lib/use-public-settings", () => ({
  usePublicSettings: () => ({ settings: {}, loading: false }),
}));

const review = (fit: FitKey | null, status: Review["status"] = "approved"): Review => ({
  id: `r-${Math.random()}`,
  productId: product.id,
  rating: 4,
  author: "Rima",
  body: "Fit note",
  date: Date.parse("2026-10-01T10:00:00Z"),
  status,
  verified: true,
  ...(fit ? { fit } : {}),
});

beforeEach(() => {
  state.reviews = [];
  state.submit.mockClear();
});

afterEach(cleanup);

const fillAndSend = () => {
  fireEvent.click(screen.getByLabelText("5 stars"));
  fireEvent.change(
    screen.getByPlaceholderText("What did you like? How was the fit?"),
    { target: { value: "Lovely fabric and the fit was right." } },
  );
  fireEvent.click(screen.getByRole("button", { name: "Submit review" }));
};

describe("ReviewsSection — fit answer", () => {
  it("offers the three answers as one tap each", () => {
    render(<ReviewsSection product={product} />);
    for (const key of ["small", "true", "large"]) {
      expect(screen.getByTestId(`fit-option-${key}`)).toBeInTheDocument();
    }
  });

  it("sends the chosen answer with the review", () => {
    render(<ReviewsSection product={product} />);
    fireEvent.click(screen.getByTestId("fit-option-small"));
    expect(screen.getByTestId("fit-option-small")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fillAndSend();
    expect(state.submit).toHaveBeenCalled();
    const call = state.submit.mock.calls[0][0] as Record<string, unknown>;
    expect(call.fit).toBe("small");
  });

  it("sends no fit when the buyer skipped the question", () => {
    render(<ReviewsSection product={product} />);
    fillAndSend();
    const call = state.submit.mock.calls[0][0] as Record<string, unknown>;
    expect(call.fit).toBeUndefined();
  });

  it("shows the bar once three approved buyers have answered", () => {
    state.reviews = [review("true"), review("true"), review("small")];
    render(<ReviewsSection product={product} />);
    const bar = screen.getByTestId("fit-bar");
    expect(bar).toHaveTextContent("সাইজ কেমন পেয়েছেন");
    expect(bar).toHaveTextContent("3 জনের মতামত");
  });

  it("stays away with only two answers — two opinions are not a statistic", () => {
    state.reviews = [review("true"), review("true")];
    render(<ReviewsSection product={product} />);
    expect(screen.queryByTestId("fit-bar")).toBeNull();
  });

  it("wears the answer on the review itself, where the next buyer reads it", () => {
    state.reviews = [review("small")];
    render(<ReviewsSection product={product} />);
    // The test harness defaults to English; the words are the point, not the script.
    expect(screen.getByTestId("review-fit-badge")).toHaveTextContent(/size/i);
  });

  it("stays away when the answers have not been approved yet", () => {
    state.reviews = [review("true", "pending"), review("true", "pending"), review("true", "pending")];
    render(<ReviewsSection product={product} />);
    expect(screen.queryByTestId("fit-bar")).toBeNull();
  });
});
