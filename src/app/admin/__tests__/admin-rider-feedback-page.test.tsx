import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffFeedbackRow } from "@/lib/delivery-feedback";

const state = vi.hoisted(() => ({ hook: {} as Record<string, unknown>, setFilter: vi.fn(), setHidden: vi.fn() }));
vi.mock("@/lib/use-rider-feedback", () => ({ useRiderFeedback: () => state.hook }));

import RiderFeedbackPage from "../riders/feedback/page";

const row = (o: Partial<StaffFeedbackRow> = {}): StaffFeedbackRow => ({
  orderId: "o1", orderNo: "PS-1001", riderId: "r1", riderName: "Rafiq", stars: 1, tags: ["late"], comment: "45 minutes late",
  hidden: false, at: Date.now(), hasFeedback: true, ...o,
});

beforeEach(() => {
  state.setFilter.mockReset();
  state.setHidden.mockReset().mockResolvedValue(null);
  state.hook = { live: true, checked: true, filter: "low", setFilter: state.setFilter, items: [row()], ready: true, loaded: true, error: null, setHidden: state.setHidden };
});

describe("/admin/riders/feedback", () => {
  it("shows stars, rider, order, the reasons and the customer's words", () => {
    render(<RiderFeedbackPage />);
    const r = screen.getByTestId("feedback-row");
    expect(r).toHaveTextContent("Rafiq");
    expect(r).toHaveTextContent("#PS-1001");
    expect(r).toHaveTextContent("Arrived late · “45 minutes late”");
  });

  it("a bare star rating says no reason was given and offers no hide button", () => {
    state.hook.items = [row({ hasFeedback: false, tags: [], comment: "" })];
    render(<RiderFeedbackPage />);
    expect(screen.getByText("Stars only — no reason given.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Hide from rider/ })).toBeNull();
  });

  it("hides / re-shows a comment from the rider", () => {
    const { rerender } = render(<RiderFeedbackPage />);
    fireEvent.click(screen.getByRole("button", { name: "Hide from rider" }));
    expect(state.setHidden).toHaveBeenCalledWith("o1", true);
    state.hook.items = [row({ hidden: true })];
    rerender(<RiderFeedbackPage />);
    fireEvent.click(screen.getByRole("button", { name: /show again/ }));
    expect(state.setHidden).toHaveBeenLastCalledWith("o1", false);
  });

  it("switches filters and explains a missing migration", () => {
    render(<RiderFeedbackPage />);
    fireEvent.click(screen.getByRole("tab", { name: "All ratings" }));
    expect(state.setFilter).toHaveBeenCalledWith("all");
  });

  it("migration banner and empty state", () => {
    state.hook.ready = false;
    state.hook.items = [];
    const { unmount } = render(<RiderFeedbackPage />);
    expect(screen.getByTestId("feedback-missing")).toHaveTextContent("202610020009");
    unmount();
    state.hook.ready = true;
    render(<RiderFeedbackPage />);
    expect(screen.getByText("No feedback here yet.")).toBeInTheDocument();
  });
});
