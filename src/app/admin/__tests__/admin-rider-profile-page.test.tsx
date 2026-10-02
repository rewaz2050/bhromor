import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { assessRisk, normalizeOverview } from "@/lib/rider-risk";

const state = vi.hoisted(() => ({ hook: {} as Record<string, unknown> }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "r1" }) }));
vi.mock("@/components/admin/rider-adjust-card", () => ({ RiderAdjustCard: () => null }));
vi.mock("@/components/admin/rider-licence-card", () => ({ RiderLicenceCard: () => null }));
vi.mock("@/lib/use-rider-overview", () => ({ useRiderOverview: () => state.hook }));

import AdminRiderProfilePage from "../riders/[id]/page";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const overview = (raw: Record<string, unknown> = {}) =>
  normalizeOverview({
    rider: { id: "r1", name: "Rafiq", phone: "01712345678", status: "active", vehicle: "bike", isOnline: true, ratingAvg: 4.5, ratingCount: 3, totalDeliveries: 41, createdAt: "2026-09-01T00:00:00Z" },
    money: { cashInHand: 450000, earningsBalance: 12000, lifetimeEarned: 90000, paidOut: 50000, pendingPayout: 2000, nettedAgainstCash: 1000, handedIn: 300000 },
    risk: { cashInHand: 450000, cashLimit: 500000, codCountSinceSettle: 4, codValueSinceSettle: 450000, oldestCodAt: hoursAgo(60), lastSettledAt: hoursAgo(80), pendingClaim: null, rejectedClaims30: 0 },
    performance: { offered30: 10, delivered30: 7, failed30: 1, declined30: 1, expired30: 1, delivered7: 3 },
    trips: [
      { id: "t1", orderNo: "PS-1", state: "delivered", at: hoursAgo(5), area: "Kandirpar", total: 50000, payment: "cod", shop: "Arian" },
      { id: "t2", orderNo: "PS-2", state: "failed", at: hoursAgo(9), area: "Haji Para", total: 20000, payment: "cod", shop: "Arian", failedReason: "no answer" },
    ],
    journal: [{ id: "j1", kind: "cod_netting", amount: -1000, note: "", at: hoursAgo(3), orderNo: null }, { id: "j2", kind: "tip", amount: 500, note: "", at: hoursAgo(4), orderNo: "PS-1" }],
    settlements: [{ id: "s1", amount: 300000, nettedAmount: 1000, method: "cash", reference: "", at: hoursAgo(80) }],
    claims: [{ id: "c1", amount: 100, method: "bkash", reference: "T", status: "rejected", at: hoursAgo(100), decidedAt: hoursAgo(99), note: "TRX mismatch" }],
    payouts: [{ id: "p1", amount: 2000, method: "bkash", account: "017", status: "pending", at: hoursAgo(2) }],
    ...raw,
  })!;

const base = (o = overview(), over: Record<string, unknown> = {}) => ({
  live: true, checked: true, overview: o, assessment: assessRisk(o), ready: true, loading: false, error: null, refresh: vi.fn(), ...over,
});

afterEach(cleanup);

describe("<AdminRiderProfilePage>", () => {
  it("shows the COD risk level with reasons and the cash-vs-cap figures", () => {
    state.hook = base();
    render(<AdminRiderProfilePage />);
    const box = screen.getByTestId("risk-box");
    expect(box).toHaveAttribute("data-level", "high");
    expect(screen.getByTestId("risk-reasons").textContent).toContain("90%");
    expect(screen.getByTestId("risk-reasons").textContent).toContain("পুরনো COD");
    expect(box.textContent).toContain("৳4,500");
    expect(box.textContent).toContain("4টি COD ডেলিভারি");
  });

  it("shows money, performance, trips (failed one with reason) and the ledgers", () => {
    state.hook = base();
    render(<AdminRiderProfilePage />);
    expect(screen.getByTestId("stat-cash")).toHaveTextContent("৳4,500");
    expect(screen.getByTestId("stat-wallet")).toHaveTextContent("৳120");
    expect(screen.getByTestId("performance").textContent).toContain("⭐ 4.5");
    const trips = screen.getAllByTestId("trip-row");
    expect(trips).toHaveLength(2);
    expect(trips[1]).toHaveAttribute("data-state", "failed");
    expect(trips[1].textContent).toContain("no answer");
    const journal = screen.getAllByTestId("journal-row");
    expect(journal[0].textContent).toContain("COD সমন্বয়");
    expect(journal[0].textContent).toContain("−");
    expect(screen.getByTestId("claims").textContent).toContain("TRX mismatch");
    expect(screen.getByTestId("settlements").textContent).toContain("ওয়ালেট থেকে সমন্বয়");
    expect(screen.getByTestId("payouts").textContent).toContain("অপেক্ষায়");
  });

  it("a clean rider reads 'no warnings'", () => {
    const o = overview({ risk: { cashInHand: 0, cashLimit: 500000 }, performance: {} });
    state.hook = base(o);
    render(<AdminRiderProfilePage />);
    expect(screen.getByTestId("risk-box")).toHaveAttribute("data-level", "ok");
    expect(screen.queryByTestId("risk-reasons")).toBeNull();
  });

  it("tells staff to run the migration when the function is missing", () => {
    state.hook = { ...base(), overview: null, assessment: null, ready: false };
    render(<AdminRiderProfilePage />);
    expect(screen.getByTestId("overview-missing").textContent).toContain("202610020002_admin_rider_overview.sql");
    expect(screen.queryByTestId("risk-box")).toBeNull();
  });
});
