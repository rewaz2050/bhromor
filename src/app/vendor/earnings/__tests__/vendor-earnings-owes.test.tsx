import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({ balance: -45000 }));

vi.mock("@/components/vendor/vendor-shell", () => ({
  useVendor: () => ({ shop: { commissionPct: 15, name: "Rafiq Store" } }),
}));
vi.mock("@/components/vendor/statement-bar", () => ({ default: () => null }));
vi.mock("@/lib/use-vendor", () => ({
  useVendorEarnings: () => ({
    loading: false,
    error: null,
    refresh: vi.fn(),
    earnings: {
      lifetimePayable: state.balance,
      lifetimePaid: 0,
      balance: state.balance,
      ledger: [],
      payouts: [{ id: "p1", amount: -10000, method: "bkash", reference: "TRX9", at: 1 }],
    },
  }),
}));

import VendorEarningsPage from "../page";

afterEach(() => {
  cleanup();
  state.balance = -45000;
});

describe("Vendor earnings — a shop that collects into its own wallet (202610020013)", () => {
  it("says the shop owes PROSANTI, with the amount unsigned, and what to do", () => {
    render(<VendorEarningsPage />);
    expect(screen.getByText("You owe PROSANTI")).toBeTruthy();
    expect(screen.getByTestId("vendor-balance").textContent).toMatch(/450/);
    expect(screen.getByTestId("vendor-balance").textContent).not.toMatch(/-/);
    expect(screen.getByText(/Customers paid your own bKash\/Nagad/)).toBeTruthy();
  });

  it("labels a remittance in the history", () => {
    render(<VendorEarningsPage />);
    expect(screen.getByText(/Sent to PROSANTI .*100/)).toBeTruthy();
  });

  it("an ordinary positive balance is unchanged", () => {
    state.balance = 45000;
    render(<VendorEarningsPage />);
    expect(screen.getByText("Balance due")).toBeTruthy();
    expect(screen.queryByText("You owe PROSANTI")).toBeNull();
  });
});
