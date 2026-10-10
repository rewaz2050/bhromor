/**
 * What a manager actually sees (permission matrix — 2026-10-09).
 *
 * The API gate is the lock; this pins the other half of the promise — that the
 * controls which answer 403 are not sitting there inviting a click. One page
 * is enough to prove the wiring end to end: the same route, two roles.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AdminPayoutsPage from "../payouts/page";

const state = vi.hoisted(() => ({
  role: "admin" as string | null,
  record: vi.fn(async () => true),
}));

vi.mock("@/lib/use-staff-live", () => ({
  useStaffLive: () => ({
    live: true,
    checked: true,
    error: null,
    role: state.role,
    retry: () => {},
  }),
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
        earned: 90000,
        paid: 0,
        balance: 90000,
        lastPayoutAt: null,
      },
    ],
    ledger: [],
    payouts: [],
  }),
}));

afterEach(() => {
  cleanup();
  state.role = "admin";
});

describe("a manager on a money page", () => {
  it("sees the balances but not the payout button", () => {
    state.role = "manager";
    render(<AdminPayoutsPage />);
    // the read half stays — a manager still needs to see who is owed what
    expect(screen.getByText(/Rafiq Store/)).toBeTruthy();
    // open the payout panel the same way an admin would
    fireEvent.click(screen.getAllByRole("button", { name: "Settle" })[0]);
    expect(screen.queryByRole("button", { name: /Record payout/ })).toBeNull();
    expect(screen.getByTestId("admin-only-note").textContent).toContain("admin");
  });

  it("an admin sees the same page with the button", () => {
    state.role = "admin";
    render(<AdminPayoutsPage />);
    fireEvent.click(screen.getAllByRole("button", { name: "Settle" })[0]);
    expect(screen.getByRole("button", { name: /Record payout/ })).toBeTruthy();
    expect(screen.queryByTestId("admin-only-note")).toBeNull();
  });
});
