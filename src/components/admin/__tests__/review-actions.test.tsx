/**
 * Round 4 (2026-09-26) — the approve / reject / suspend buttons shared by
 * Admin → Shops and Admin → Riders, plus the audit line under a card.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ReviewActions, ReviewSummary, reviewAgeLabel } from "../review-actions";

describe("ReviewActions", () => {
  it("offers Approve and Reject for a pending application", () => {
    const onDecide = vi.fn();
    render(<ReviewActions kind="shop" name="Arian" status="pending" onDecide={onDecide} suspendEffect="x" />);
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onDecide).toHaveBeenCalledWith("active");
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /suspend/i })).not.toBeInTheDocument();
  });

  it("requires a reason before sending a rejection", () => {
    const onDecide = vi.fn();
    render(<ReviewActions kind="rider" name="Tanvir" status="pending" onDecide={onDecide} suspendEffect="x" />);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    const box = screen.getByLabelText(/reason shown to the applicant/i);
    fireEvent.click(screen.getByRole("button", { name: /send rejection/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(/reason/i);
    expect(onDecide).not.toHaveBeenCalled();

    fireEvent.change(box, { target: { value: "  NID photo is blurry  " } });
    fireEvent.click(screen.getByRole("button", { name: /send rejection/i }));
    expect(onDecide).toHaveBeenCalledWith("rejected", "NID photo is blurry");
    // Back to the buttons afterwards.
    expect(screen.queryByLabelText(/reason shown to the applicant/i)).not.toBeInTheDocument();
  });

  it("lets staff cancel a rejection", () => {
    const onDecide = vi.fn();
    render(<ReviewActions kind="shop" name="Arian" status="pending" onDecide={onDecide} suspendEffect="x" />);
    fireEvent.click(screen.getByRole("button", { name: /reject/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(onDecide).not.toHaveBeenCalled();
  });

  it("offers Approve and Re-open for a rejected application, Re-activate for a suspended one", () => {
    const onDecide = vi.fn();
    const { rerender } = render(
      <ReviewActions kind="shop" name="Arian" status="rejected" onDecide={onDecide} suspendEffect="x" />,
    );
    fireEvent.click(screen.getByRole("button", { name: /re-open/i }));
    expect(onDecide).toHaveBeenCalledWith("pending");
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();

    rerender(<ReviewActions kind="shop" name="Arian" status="suspended" onDecide={onDecide} suspendEffect="x" />);
    fireEvent.click(screen.getByRole("button", { name: /re-activate/i }));
    expect(onDecide).toHaveBeenLastCalledWith("active");
  });

  it("confirms before suspending an active row and passes the optional reason", () => {
    const onDecide = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const prompt = vi.spyOn(window, "prompt").mockReturnValue(" cash not settled ");
    render(<ReviewActions kind="rider" name="Tanvir" status="active" onDecide={onDecide} suspendEffect="Offers stop." />);
    fireEvent.click(screen.getByRole("button", { name: /suspend/i }));
    expect(confirm.mock.calls[0][0]).toMatch(/Offers stop\./);
    expect(onDecide).toHaveBeenCalledWith("suspended", "cash not settled");
    confirm.mockRestore();
    prompt.mockRestore();
  });
});

describe("ReviewSummary", () => {
  it("renders nothing for a row that was never reviewed", () => {
    const { container } = render(<ReviewSummary status="pending" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows who decided, when, and the reason sent to a rejected applicant", () => {
    const at = Date.now() - 5 * 60_000;
    render(<ReviewSummary status="rejected" review={{ note: "Phone never answers", by: "admin@prosanti.example", at }} />);
    expect(screen.getByText(/Rejected by admin@prosanti\.example · 5 min ago/)).toBeInTheDocument();
    expect(screen.getByText(/Reason sent to applicant:/).closest("p")).toHaveTextContent(/Phone never answers/);
  });

  it("formats ages sensibly", () => {
    const now = 1_000_000_000_000;
    expect(reviewAgeLabel(now - 10_000, now)).toBe("just now");
    expect(reviewAgeLabel(now - 30 * 60_000, now)).toBe("30 min ago");
    expect(reviewAgeLabel(now - 5 * 3_600_000, now)).toBe("5 h ago");
    expect(reviewAgeLabel(now - 3 * 86_400_000, now)).toBe("3 d ago");
  });
});
