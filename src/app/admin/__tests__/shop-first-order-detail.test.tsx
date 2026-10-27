import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { makePlacedOrder, type Order } from "@/lib/orders";
import AdminOrderDetailPage from "../orders/[id]/page";

const state = vi.hoisted(() => ({ order: undefined as Order | undefined, canManage: false, advance: vi.fn() }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "PS-SHOP-FIRST" }) }));
vi.mock("@/lib/use-orders", () => ({ useOrder: () => ({
  order: state.order, loading: false, error: null, clearError: vi.fn(),
  advance: state.advance, cancel: vi.fn(), refresh: vi.fn(),
}) }));
vi.mock("@/lib/use-staff-role", () => ({ useStaffRole: () => ({ checked: true, canManage: state.canManage }) }));
vi.mock("@/components/admin/warranty-claims-card", () => ({ default: () => null }));
vi.mock("@/components/admin/order-whatsapp-status", () => ({ default: () => null }));
vi.mock("@/components/admin/wa-draft-panel", () => ({ default: () => null }));
vi.mock("@/components/admin/payment-card", () => ({ default: () => null }));
vi.mock("@/components/admin/failed-proof-panel", () => ({ default: () => null }));

beforeEach(() => {
  state.canManage = false; state.advance.mockReset().mockResolvedValue(true);
  state.order = { ...makePlacedOrder({
    id: "PS-SHOP-FIRST", createdAt: Date.now(),
    customer: { name: "Test Customer", phone: "01711111111", area: "Town" },
    zone: { id: "test", name: "Town", charge: 0, etaLabel: "40–50 min" }, items: [],
  }), shopId: "shop-1" };
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("shop-first order detail integration", () => {
  it("manager sees shop ownership, not routine fulfilment or emergency controls", () => {
    render(<AdminOrderDetailPage />);
    expect(screen.getByText(/Normal fulfilment actions are in the shop dashboard/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm order" })).toBeNull();
    expect(screen.queryByText("Emergency shop fulfilment override")).toBeNull();
  });
  it("admin's exception panel passes explicit intent, target and required reason to the hook", async () => {
    state.canManage = true;
    render(<AdminOrderDetailPage />);
    expect(screen.queryByRole("button", { name: "Confirm order" })).toBeNull();
    fireEvent.click(screen.getByText("Emergency shop fulfilment override"));
    fireEvent.change(screen.getByLabelText("Reason for overriding the shop"), { target: { value: "Shop unavailable; verified support request" } });
    fireEvent.click(screen.getByRole("button", { name: "Record emergency override" }));
    await waitFor(() => expect(state.advance).toHaveBeenCalledExactlyOnceWith("PS-SHOP-FIRST", "confirmed", "Shop unavailable; verified support request", true));
  });
  it("Traffic Point handover verifies customer input without displaying the stored PIN", async () => {
    state.order = { ...state.order!, status: "ready-for-pickup", isPickup: true, deliveryCode: "4821" };
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminOrderDetailPage />);
    expect(screen.queryByText("PIN:" )).toBeNull();
    expect(screen.queryByText("4821")).toBeNull();
    fireEvent.change(screen.getByLabelText("Customer PIN / কাস্টমারের PIN"), { target: { value: "4821" } });
    fireEvent.click(screen.getByRole("button", { name: "Verify PIN & hand over" }));
    await waitFor(() => expect(state.advance).toHaveBeenCalledWith("PS-SHOP-FIRST", "delivered", undefined, false, "4821"));
    expect(screen.queryByText("Emergency shop fulfilment override")).toBeNull();
  });
});
