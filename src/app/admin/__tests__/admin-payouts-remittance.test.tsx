import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminPayoutsPage from "../payouts/page";

const state = vi.hoisted(() => ({
  balance: -45000,
  record: vi.fn(async (input: Record<string, unknown>) => Boolean(input)),
}));

// The page's admin-only controls are gated on the staff role (permission
// matrix, 2026-10-09). These tests walk the admin's own flow, so sign the
// probe in as one — a manager would not see these buttons at all.
vi.mock("@/lib/use-staff-live", () => ({
  useStaffLive: () => ({ live: true, checked: true, error: null, role: "admin", retry: () => {} }),
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
      {
        shop: { id: "s2", name: "Plain Shop", status: "active", isOpen: true },
        earned: 90000,
        paid: 0,
        balance: 90000,
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
    // the summary keeps the debt apart from what PROSANTI owes shops
    expect(screen.getByTestId("shops-owe-total").textContent).toMatch(/450/);
    fireEvent.click(screen.getAllByRole("button", { name: "Settle" })[0]);
    expect(screen.getByText(/Remitted .*100/)).toBeTruthy();
  });

  it("can narrow the table to the shops that owe PROSANTI", () => {
    render(<AdminPayoutsPage />);
    expect(screen.getByText("Plain Shop")).toBeTruthy();
    fireEvent.click(screen.getByTestId("owing-filter"));
    expect(screen.queryByText("Plain Shop")).toBeNull();
    expect(screen.getByText("Rafiq Store")).toBeTruthy();
    fireEvent.click(screen.getByTestId("owing-filter"));
    expect(screen.getByText("Plain Shop")).toBeTruthy();
  });

  it("offers no filter when no shop owes anything", () => {
    state.balance = 45000;
    render(<AdminPayoutsPage />);
    expect(screen.queryByTestId("owing-filter")).toBeNull();
  });

  it("records what the shop sent as a remittance, prefilled with the debt", async () => {
    render(<AdminPayoutsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Settle" })[0]);
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
    fireEvent.click(screen.getAllByRole("button", { name: "Settle" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Record payout" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm payout" }));
    await waitFor(() => expect(state.record).toHaveBeenCalled());
    expect(state.record.mock.calls[0][0]).not.toHaveProperty("direction");
  });
});
