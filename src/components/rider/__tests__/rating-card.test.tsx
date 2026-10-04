import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import RatingCard from "../rating-card";
import type { RatingSummary } from "@/lib/rider-rating";

afterEach(cleanup);

const summary = (over: Partial<RatingSummary> = {}): RatingSummary => ({
  count: 4, avg: 3.8, distribution: [1, 0, 0, 1, 2], last30: { count: 3, avg: 4.3 }, low: [{ stars: 1, at: Date.parse("2026-10-01T00:00:00Z"), orderNo: "PS-9" }], ...over,
});

describe("<RatingCard>", () => {
  it("renders nothing without ratings", () => {
    const { container, rerender } = render(<RatingCard summary={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<RatingCard summary={summary({ count: 0 })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the average, the star spread, the 30-day figure and low-star orders", () => {
    render(<RatingCard summary={summary()} />);
    expect(screen.getByTestId("rating-avg")).toHaveTextContent("3.8");
    expect(screen.getByTestId("rating-row-5")).toHaveTextContent("2");
    expect(screen.getByTestId("rating-row-1")).toHaveTextContent("1");
    expect(screen.getByTestId("rating-30d")).toHaveTextContent("4.3");
    expect(screen.getByTestId("rating-low")).toHaveTextContent("PS-9");
  });

  it("hides the low-star box and the 30-day line when there is nothing to show", () => {
    render(<RatingCard summary={summary({ low: [], last30: { count: 0, avg: 0 } })} />);
    expect(screen.queryByTestId("rating-low")).toBeNull();
    expect(screen.queryByTestId("rating-30d")).toBeNull();
  });

  it("shows what customers said — reasons in Bangla and their words — and nothing when there is none (item X)", () => {
    const at = Date.parse("2026-10-01T00:00:00Z");
    const { rerender } = render(
      <RatingCard summary={summary({ feedback: [{ stars: 2, at, orderNo: "PS-9", tags: ["late", "rude"], comment: "slow" }, { stars: 5, at, tags: ["polite"], comment: "" }] })} />,
    );
    const items = screen.getAllByTestId("rating-feedback-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("দেরিতে এসেছে · খারাপ ব্যবহার");
    expect(items[0]).toHaveTextContent("“slow”");
    expect(items[0]).toHaveTextContent("PS-9");
    expect(items[1]).toHaveTextContent("ভদ্র ব্যবহার");
    rerender(<RatingCard summary={summary({ feedback: [] })} />);
    expect(screen.queryByTestId("rating-feedback")).toBeNull();
    rerender(<RatingCard summary={summary()} />);
    expect(screen.queryByTestId("rating-feedback")).toBeNull();
  });
});
