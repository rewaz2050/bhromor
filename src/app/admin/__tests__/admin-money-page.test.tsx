/**
 * Admin → Money (202609300002 — audit items M/D): the platform position, the
 * payout queue with its confirm step, and the pay-rate editor that writes the
 * SAME site_settings keys the deliver RPC reads.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AdminMoneyPage from "../money/page";

const state = vi.hoisted(() => ({
  live: true,
  loading: false,
  ready: true,
  summary: null as unknown,
  pending: [] as unknown[],
  decided: [] as unknown[],
  settings: { baseFee: 4000, codHandlingFee: 1000, minPayout: 1000 },
  decide: vi.fn(async () => true),
  saveSettings: vi.fn(async () => true),
}));

vi.mock("@/lib/use-admin-money", () => ({
  useAdminMoney: () => ({
    live: state.live,
    loading: state.loading,
    ready: state.ready,
    summary: state.summary,
    pending: state.pending,
    decided: state.decided,
    settings: state.settings,
    error: null,
    clearError: vi.fn(),
    refresh: vi.fn(async () => true),
    decide: state.decide,
    saveSettings: state.saveSettings,
  }),
}));

const summary = {
  commissionIncome: 10000,
  deliveryIncome: 50000,
  tipsCollected: 5000,
  tipsToRiders: 5000,
  riderFeesEarned: 14000,
  deliveredOrders: 3,
  riderPayable: 14000,
  riderPayoutsPending: 5000,
  riderPayoutsPendingCount: 1,
  riderPayoutsPaid: 5000,
  shopPayable: 50000,
  codCustody: 220000,
  codClaimsPending: 100000,
  activeRiders: 1,
  onlineRiders: 0,
  baseFee: 4000,
  codHandlingFee: 1000,
  minPayout: 1000,
};

beforeEach(() => {
  state.live = true;
  state.loading = false;
  state.ready = true;
  state.summary = summary;
  state.pending = [];
  state.decided = [];
  state.settings = { baseFee: 4000, codHandlingFee: 1000, minPayout: 1000 };
  state.decide = vi.fn(async () => true);
  state.saveSettings = vi.fn(async () => true);
});

afterEach(() => cleanup());

describe("admin money page", () => {
  it("asks for a staff session when there is none", () => {
    state.live = false;
    render(<AdminMoneyPage />);
    expect(screen.getByText(/Money needs a staff session/)).toBeInTheDocument();
  });

  it("names the migration when the backend update has not run", () => {
    state.ready = false;
    state.summary = null;
    render(<AdminMoneyPage />);
    expect(screen.getByText(/Rider money backend is not installed yet/)).toBeInTheDocument();
    expect(screen.getByText(/202609300002_rider_money.sql/)).toBeInTheDocument();
  });

  it("shows the platform position and what is owed out", () => {
    render(<AdminMoneyPage />);
    expect(screen.getByText("Commission")).toBeInTheDocument();
    expect(screen.getByText("৳100")).toBeInTheDocument(); // ৳10,000 paisa commission
    expect(screen.getByText("Rider payable (wallet)")).toBeInTheDocument();
    expect(screen.getByText("COD cash in riders' hands")).toBeInTheDocument();
    expect(screen.getByText(/৳1,000 claimed & awaiting approval/)).toBeInTheDocument();
  });

  it("warns while the per-delivery rates are still zero", () => {
    state.summary = { ...summary, baseFee: 0, codHandlingFee: 0 };
    render(<AdminMoneyPage />);
    expect(screen.getByText(/প্রতি-ডেলিভারি রেট এখনো সেট করা হয়নি/)).toBeInTheDocument();
  });

  it("walks a payout through the paid confirm step", async () => {
    state.pending = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        riderId: "r1",
        riderName: "Karim",
        riderPhone: "01700000000",
        amount: 5000,
        method: "bkash",
        account: "01700000000",
        status: "pending",
        requestedAt: Date.now(),
        reference: "",
        earningsBalance: 9000,
        cashInHand: 220000,
      },
    ];
    render(<AdminMoneyPage />);
    fireEvent.click(screen.getByRole("button", { name: /Mark paid/ }));
    expect(screen.getByText(/Confirm the money left the office/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("TRX1234…"), { target: { value: "TRX99" } });
    fireEvent.click(screen.getByRole("button", { name: /Confirm paid/ }));
    await waitFor(() =>
      expect(state.decide).toHaveBeenCalledWith({
        payoutId: "11111111-1111-1111-1111-111111111111",
        decision: "paid",
        note: "",
        reference: "TRX99",
      }),
    );
  });

  it("saves the rates in paisa after the owner types taka", async () => {
    render(<AdminMoneyPage />);
    const [base, cod, min] = screen.getAllByRole("spinbutton") as HTMLInputElement[];
    expect(base.value).toBe("40");
    expect(cod.value).toBe("10");
    expect(min.value).toBe("10");
    fireEvent.change(base, { target: { value: "45" } });
    fireEvent.click(screen.getByRole("button", { name: /Save rates/ }));
    await waitFor(() =>
      expect(state.saveSettings).toHaveBeenCalledWith({
        baseFee: 4500,
        codHandlingFee: 1000,
        minPayout: 1000,
      }),
    );
  });
});
