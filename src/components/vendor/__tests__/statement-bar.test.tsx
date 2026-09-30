/**
 * A5 — the statement bar. The month switch must change both the totals on
 * screen and the file, and an empty month must say so instead of showing a
 * confident ৳0.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import StatementBar from "@/components/vendor/statement-bar";
import { downloadText } from "@/lib/csv";
import type { VendorEarnings } from "@/lib/db/vendor";

vi.mock("@/lib/csv", async () => {
  const actual = await vi.importActual<typeof import("@/lib/csv")>("@/lib/csv");
  return { ...actual, downloadText: vi.fn() };
});

const at = (iso: string) => Date.parse(iso);

const earnings: VendorEarnings = {
  lifetimePayable: 170_000,
  lifetimePaid: 100_000,
  balance: 70_000,
  ledger: [
    {
      id: "l1",
      orderId: "11111111-2222-3333-4444-555555555555",
      orderNo: "PS-1001",
      subtotal: 120_000,
      commission: 18_000,
      payable: 102_000,
      at: at("2026-09-10T12:00:00+06:00"),
    },
  ],
  payouts: [
    { id: "o1", amount: 50_000, method: "bKash", reference: "TRX1", at: at("2026-09-12T12:00:00+06:00") },
  ],
};

afterEach(() => {
  cleanup();
  vi.mocked(downloadText).mockClear();
});

describe("<StatementBar>", () => {
  it("shows the month's real totals and downloads that same month", () => {
    render(<StatementBar earnings={earnings} />);
    expect(screen.getByTestId("statement-totals").textContent).toContain("৳1,020");
    expect(screen.getByTestId("statement-totals").textContent).toContain("৳500");

    fireEvent.click(screen.getByTestId("statement-download"));
    expect(downloadText).toHaveBeenCalledTimes(1);
    const [filename, csv] = vi.mocked(downloadText).mock.calls[0]!;
    expect(filename).toMatch(/^prosanti-statement-\d{4}-\d{2}-\d{8}\.csv$/);
    expect(csv).toContain("PS-1001");
    expect(csv).toContain("TRX1");
  });

  it("says an empty month has nothing delivered instead of implying a flat month", () => {
    // A payout-only month: money went out, nothing was delivered.
    const payoutOnly: VendorEarnings = {
      ...earnings,
      ledger: [],
      payouts: [
        { id: "o9", amount: 50_000, method: "bKash", reference: "TRX9", at: at("2025-08-12T12:00:00+06:00") },
      ],
    };
    render(<StatementBar earnings={payoutOnly} />);
    expect(screen.getByText(/nothing delivered in this month/)).toBeInTheDocument();
  });
});
