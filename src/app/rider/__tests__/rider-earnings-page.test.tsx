/**
 * /rider/earnings (202609300002 — audit item N): wallet vs COD cash never
 * blur, a pending withdrawal blocks a second request, and the page says
 * honestly when the backend update has not run.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RiderEarningsPage from "../earnings/page";

const state = vi.hoisted(() => ({
  ready: true,
  summary: null as unknown,
  entries: [] as unknown[],
  payouts: [] as unknown[],
  requestPayout: vi.fn(async () => ({ ok: true })),
  refresh: vi.fn(async () => {}),
}));

vi.mock("@/lib/use-rider", () => ({
  useRiderSession: () => ({
    rider: { id: "r1", name: "রফিক", cashInHand: 220000 },
    email: "rider@example.com",
    status: "authed",
    error: null,
    denyReason: null,
    refresh: vi.fn(async () => {}),
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

const incentives = vi.hoisted(() => ({ view: null as unknown }));
vi.mock("@/lib/use-rider-incentives", () => ({
  useRiderIncentives: () => ({ view: incentives.view, loading: false }),
}));

vi.mock("@/lib/use-rider-money", () => ({
  useRiderEarnings: () => ({
    ready: state.ready,
    summary: state.summary,
    entries: state.entries,
    payouts: state.payouts,
    loading: false,
    error: null,
    refresh: state.refresh,
    requestPayout: state.requestPayout,
  }),
}));

const summary = {
  balance: 14000,
  cashInHand: 220000,
  today: 19000,
  week: 19000,
  lifetime: 19000,
  tips: 5000,
  deliveryFees: 12000,
  codHandling: 2000,
  incentives: 0,
  paidOut: 5000,
  pendingPayout: 0,
  deliveriesToday: 3,
  baseFee: 4000,
  codHandlingFee: 1000,
  minPayout: 1000,
};

beforeEach(() => {
  state.ready = true;
  state.summary = summary;
  state.entries = [];
  state.payouts = [];
  state.requestPayout = vi.fn(async () => ({ ok: true }));
  window.localStorage.clear();
});

afterEach(() => cleanup());

describe("rider earnings page", () => {
  it("names the migration while the backend update is missing", () => {
    state.ready = false;
    state.summary = null;
    render(<RiderEarningsPage />);
    expect(screen.getByText(/আয়ের পেজ এখনো চালু হয়নি/)).toBeInTheDocument();
    expect(screen.getByText(/202609300002_rider_money.sql/)).toBeInTheDocument();
  });

  it("keeps the wallet and the COD cash apart", () => {
    render(<RiderEarningsPage />);
    expect(screen.getByTestId("earnings-balance")).toHaveTextContent("৳140");
    expect(screen.getByTestId("earnings-cash")).toHaveTextContent("৳2,200");
    expect(screen.getByTestId("earnings-paid-out")).toHaveTextContent("৳50");
    expect(screen.getByText(/এটা আপনার আয় নয়/)).toBeInTheDocument();
  });

  it("shows the per-delivery rates behind each credit", () => {
    render(<RiderEarningsPage />);
    expect(screen.getByText(/ডেলিভারি ফি:/).parentElement).toHaveTextContent("৳40");
    expect(screen.getByText(/COD হ্যান্ডলিং:/).parentElement).toHaveTextContent("৳10");
    expect(screen.getByText("১০০% আপনার")).toBeInTheDocument();
  });

  it("lists the journal with public order numbers and signed amounts", () => {
    state.entries = [
      { id: "e1", kind: "tip", amount: 5000, note: "", at: Date.now(), orderId: "PS-20260930-0001" },
      { id: "e2", kind: "payout", amount: -5000, note: "payout request", at: Date.now(), payoutId: "p1" },
    ];
    render(<RiderEarningsPage />);
    expect(screen.getByText(/অর্ডার PS-20260930-0001/)).toBeInTheDocument();
    expect(screen.getByText("−৳50")).toBeInTheDocument();
    expect(screen.getByText("+৳50")).toBeInTheDocument();
  });

  it("files a withdrawal in taka after the form is filled", async () => {
    render(<RiderEarningsPage />);
    fireEvent.change(screen.getByPlaceholderText("500"), { target: { value: "50" } });
    fireEvent.change(screen.getByPlaceholderText("01XXXXXXXXX"), {
      target: { value: "01700000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: /উত্তোলনের অনুরোধ করুন/ }));
    await waitFor(() =>
      expect(state.requestPayout).toHaveBeenCalledWith({
        amountTaka: 50,
        method: "bkash",
        account: "01700000000",
      }),
    );
    expect(await screen.findByText(/অ্যাডমিনের কাছে গেছে/)).toBeInTheDocument();
  });

  it("refuses an amount above the wallet without calling the API", async () => {
    render(<RiderEarningsPage />);
    fireEvent.change(screen.getByPlaceholderText("500"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: /উত্তোলনের অনুরোধ করুন/ }));
    expect(await screen.findByText(/এত টাকা নেই/)).toBeInTheDocument();
    expect(state.requestPayout).not.toHaveBeenCalled();
  });

  it("blocks a second request while one is pending", () => {
    state.payouts = [
      {
        id: "p1",
        amount: 5000,
        method: "bkash",
        account: "01700000000",
        status: "pending",
        requestedAt: Date.now(),
        reference: "",
      },
    ];
    render(<RiderEarningsPage />);
    expect(screen.getByText(/একসাথে একটির বেশি অনুরোধ/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /উত্তোলনের অনুরোধ করুন/ })).not.toBeInTheDocument();
    expect(screen.getByText("অপেক্ষায়")).toBeInTheDocument();
  });

  it("a rejected withdrawal says the held money came back to the wallet", () => {
    state.payouts = [
      { id: "p2", amount: 5000, method: "bkash", account: "01700000000", status: "rejected", requestedAt: Date.now(), reference: "", note: "নম্বর ভুল" },
    ];
    render(<RiderEarningsPage />);
    expect(screen.getByTestId("payout-refund-note")).toHaveTextContent("ফেরত এসেছে");
    expect(screen.getByText(/নম্বর ভুল/)).toBeInTheDocument();
  });

  it("shows the bonus card only when the rider's view says bonuses are on", () => {
    state.ready = true;
    state.summary = summary;
    incentives.view = null;
    const { unmount } = render(<RiderEarningsPage />);
    expect(screen.queryByTestId("incentives-card")).toBeNull();
    unmount();
    incentives.view = {
      settings: { dailyTarget: 8, dailyBonus: 5000, referralBonus: 0, referralAfter: 10 },
      today: { done: 2, target: 8, left: 6, reached: false, percent: 25 },
      todayPaid: false,
      referral: { code: "K7MQ2X", after: 10, bonus: 0, items: [], totalEarned: 0 },
      totalEarned: 0,
    };
    render(<RiderEarningsPage />);
    expect(screen.getByTestId("incentives-card")).toHaveTextContent("2/8");
    incentives.view = null;
  });
});
