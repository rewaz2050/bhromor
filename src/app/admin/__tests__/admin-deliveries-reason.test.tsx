/**
 * Cancel-order and Release-rider ask for their reason in an inline dialog (it was
 * window.prompt, which did nothing at all when the answer was too short).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  deliveries: [] as unknown[],
  failed: [] as unknown[],
  resolveFailed: vi.fn(),
  release: vi.fn(),
}));

vi.mock("@/lib/use-admin-deliveries", () => ({
  useAdminDeliveries: () => ({
    deliveries: state.deliveries, awaitingOrders: [], failedDeliveries: state.failed,
    resolveFailed: state.resolveFailed, release: state.release,
    loading: false, error: null, clearError: vi.fn(), busyId: null, refresh: vi.fn(), offer: vi.fn(), cancel: vi.fn(),
  }),
}));
vi.mock("@/lib/use-riders", () => ({
  RIDERS_POLL_MS: 0,
  useRiders: () => ({ riders: [], loading: false, dispatch: { cashCap: 500000, offerTtl: 90, maxAttempts: 2, loadLimit: 2 } }),
}));
vi.mock("@/lib/use-orders", () => ({ useOrders: () => ({ orders: [] }) }));
vi.mock("@/components/admin/admin-live-map", () => ({ default: () => null }));
vi.mock("@/components/admin/admin-sla-alerts", () => ({ AdminSlaAlerts: () => null }));
vi.mock("@/components/admin/admin-batch-assign", () => ({ AdminBatchAssign: () => null }));

import AdminDeliveriesPage from "../deliveries/page";

const order = (id: string) => ({
  id, status: "out-for-delivery", zoneId: "town", zoneName: "Town", total: 125000, createdAt: 1,
  timeline: [], customer: { name: "Rahim", phone: "01712345678" }, payment: "cod", isPickup: false,
});

afterEach(() => {
  cleanup();
  state.resolveFailed.mockReset();
  state.release.mockReset();
  state.deliveries = [];
  state.failed = [];
});

describe("reason dialogs on /admin/deliveries", () => {
  it("Cancel order asks inline, pre-fills the rider's reason, and needs 3 characters", () => {
    state.failed = [{ order: order("PS-9"), attempts: 2, reason: "phone off", riderName: "Rafiq", riderPhone: "0", failedAt: 1 }];
    const prompt = vi.spyOn(window, "prompt");
    render(<AdminDeliveriesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    expect(prompt).not.toHaveBeenCalled();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Why is #PS-9 being cancelled");
    expect((screen.getByLabelText("Reason") as HTMLTextAreaElement).value).toBe("phone off");
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: " ab " } });
    expect(screen.getByText(/At least 3 characters/)).toBeInTheDocument();
    const confirm = screen.getAllByRole("button", { name: "Cancel order" }).at(-1)!;
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "  customer unreachable  " } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(state.resolveFailed).toHaveBeenCalledWith("PS-9", "cancel", "customer unreachable");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Back closes the dialog and does nothing", () => {
    state.failed = [{ order: order("PS-9"), attempts: 2, reason: "phone off", riderName: "Rafiq", riderPhone: "0", failedAt: 1 }];
    render(<AdminDeliveriesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel order" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(state.resolveFailed).not.toHaveBeenCalled();
  });

  it("Release rider needs 5 characters and says what will happen to the parcel", () => {
    state.deliveries = [{ id: "asg-1", orderId: "PS-7", state: "picked_up", riderName: "Rafiq", riderPhone: "0171", offeredAt: 1, order: order("PS-7") }];
    render(<AdminDeliveriesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Release rider" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("while carrying the parcel");
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "abcd" } });
    const confirm = screen.getAllByRole("button", { name: "Release rider" }).at(-1)!;
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "rider unreachable" } });
    fireEvent.click(confirm);
    expect(state.release).toHaveBeenCalledWith("asg-1", "rider unreachable");
  });

  it("Escape closes it", () => {
    state.deliveries = [{ id: "asg-1", orderId: "PS-7", state: "accepted", riderName: "Rafiq", riderPhone: "0171", offeredAt: 1, order: order("PS-7") }];
    render(<AdminDeliveriesPage />);
    fireEvent.click(screen.getByRole("button", { name: "Release rider" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("back to the area queue");
    fireEvent.keyDown(screen.getByLabelText("Reason"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(state.release).not.toHaveBeenCalled();
  });
});
