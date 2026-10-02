import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

const state = vi.hoisted(() => ({ awaiting: [] as unknown[], riders: [] as unknown[], ridersLoading: false }));

vi.mock("@/lib/use-admin-deliveries", () => ({
  useAdminDeliveries: () => ({
    deliveries: [], awaitingOrders: state.awaiting, failedDeliveries: [], resolveFailed: vi.fn(), release: vi.fn(),
    loading: false, error: null, clearError: vi.fn(), busyId: null, refresh: vi.fn(), offer: vi.fn(), cancel: vi.fn(),
  }),
}));
vi.mock("@/lib/use-riders", () => ({
  RIDERS_POLL_MS: 0,
  useRiders: () => ({ riders: state.riders, loading: state.ridersLoading, dispatch: { cashCap: 500000, offerTtl: 90, maxAttempts: 2, loadLimit: 2 } }),
}));
vi.mock("@/lib/use-orders", () => ({ useOrders: () => ({ orders: [] }) }));
vi.mock("@/components/admin/admin-live-map", () => ({ default: () => null }));
vi.mock("@/components/admin/admin-sla-alerts", () => ({ AdminSlaAlerts: () => null }));
vi.mock("@/components/admin/admin-batch-assign", () => ({ AdminBatchAssign: () => null }));

import AdminDeliveriesPage from "../deliveries/page";

const order = (id: string, over: Record<string, unknown> = {}) => ({
  id, status: "ready-for-pickup", zoneId: "town", zoneName: "Town", total: 125000, createdAt: Date.now() - 3 * 60_000,
  timeline: [{ status: "ready-for-pickup", at: Date.now() - 3 * 60_000 }],
  customer: { name: "Rahim", phone: "01712345678" }, payment: "cod", isPickup: false, ...over,
});
const rider = (over: Record<string, unknown> = {}) => ({
  id: "r1", name: "Rafiq", phone: "0", vehicle: "bike", zoneIds: ["town"], status: "active", isOnline: true,
  cashInHand: 0, currentLoad: 0, ratingAvg: 0, ratingCount: 0, ...over,
});

afterEach(cleanup);

describe("dispatch board — why is this order not moving (S)", () => {
  it("an order in a zone nobody covers gets a red banner and the reason + fix on its row", () => {
    state.awaiting = [order("PS-1")];
    state.riders = [rider({ zoneIds: ["other-zone"] })];
    render(<AdminDeliveriesPage />);
    expect(screen.getByTestId("coverage-alert")).toHaveTextContent("1 waiting order has no rider");
    const line = screen.getByTestId("coverage-line");
    expect(line).toHaveAttribute("data-reason", "no-rider-in-zone");
    expect(line).toHaveTextContent("No active rider covers Town");
    expect(within(line).getByText(/Add this zone to a rider/)).toBeInTheDocument();
  });

  it("a covered order shows a calm line and no banner", () => {
    state.awaiting = [order("PS-2")];
    state.riders = [rider()];
    render(<AdminDeliveriesPage />);
    expect(screen.queryByTestId("coverage-alert")).toBeNull();
    expect(screen.getByTestId("coverage-line")).toHaveAttribute("data-reason", "pending-offers");
  });

  it("names offline riders, and counts every uncovered order in the banner", () => {
    state.awaiting = [order("PS-3"), order("PS-4")];
    state.riders = [rider({ isOnline: false })];
    render(<AdminDeliveriesPage />);
    expect(screen.getByTestId("coverage-alert")).toHaveTextContent("2 waiting orders have no rider");
    expect(screen.getAllByTestId("coverage-line")[0]).toHaveTextContent("all offline");
  });

  it("stays quiet while the rider roster is still loading (no false alarm)", () => {
    state.awaiting = [order("PS-5")];
    state.riders = [];
    state.ridersLoading = true;
    render(<AdminDeliveriesPage />);
    expect(screen.queryByTestId("coverage-alert")).toBeNull();
    expect(screen.queryByTestId("coverage-line")).toBeNull();
    state.ridersLoading = false;
  });
});
