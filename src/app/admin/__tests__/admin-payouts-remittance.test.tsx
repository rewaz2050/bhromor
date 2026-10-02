import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminPayoutsPage from "../payouts/page";

const state = vi.hoisted(() => ({
  balance: -45000,
  record: vi.fn(async () => true),
}));

vi.mock("@/lib/use-payouts", () => ({
  usePayouts: () => ({
    live: true,
    loading: false,
    error: null,
    clearError: vi.fn(),
    record: state.record,
    balances: [
      {
        shop: { id: "s1", name: "Rafiq Store", status: "active", isOpen: true },
        earned: state.balance,
        paid: 0,
        balance: state.balance,
        lastPayoutAt: null,
      },
    ],
    ledger: [],
    payouts: [{ id: "p0", amount: -10000, method: "bkash", reference: "TRX1", at: 1 }],
  }),
}));

afterEach(() => {
  cleanup();
  state.balance = -45000;
  state.record.mockClear();
});

describe("Admin payouts — a shop that owes PROSANTI (202610020013)", () => {
  it("shows the debt instead of a minus figure, and a remittance in the history", () => {
    render(<AdminPayoutsPage />);
    expect(screen.getByTestId("owes-platform").textContent).toMatch(/Owes PROSANTI.*450/);
    fireEvent.click(screen.getByRole("button", { name: "Settle" }));
    expect(screen.getByText(/Remitted .*100/)).toBeTruthy();
  });

  it("records what the shop sent as a remittance, prefilled with the debt", async () => {
    render(<AdminPayoutsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Settle" }));
    fireEvent.click(screen.getByRole("button", { name: /Record remittance/ }));
    const amount = screen.getByLabelText(/Amount/) as HTMLInputElement;
    expect(amount.value).toBe("450");
    fireEvent.click(screen.getByRole("button", { name: "Confirm remittance" }));
    await waitFor(() => expect(state.record).toHaveBeenCalled());
    expect(state.record).toHaveBeenCalledWith(
      expect.objectContaining({ shopId: "s1", amountTaka: 450, direction: "remit" }),
    );
  });

  it("a shop PROSANTI owes is a normal payout — no direction sent", async () => {
    state.balance = 45000;
    render(<AdminPayoutsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Settle" }));
    fireEvent.click(screen.getByRole("button", { name: "Record payout" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm payout" }));
    await waitFor(() => expect(state.record).toHaveBeenCalled());
    expect(state.record.mock.calls[0][0]).not.toHaveProperty("direction");
  });
});
