import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  role: "admin", shopId: "shop-1" as string | null, status: "pending", isReturn: false,
  calls: [] as { name: string; args: Record<string, unknown> }[],
  rpcError: null as { message: string; code: string } | null,
}));
const db = {
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({
    data: { id: "order-uuid", shop_id: state.shopId, is_return: state.isReturn, payment: "cod", status: state.status }, error: null,
  }) }) }) }),
  rpc: async (name: string, args: Record<string, unknown>) => {
    state.calls.push({ name, args });
    if (!state.rpcError) state.status = String(args.p_to);
    return { error: state.rpcError };
  },
};
vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class extends Error {},
  forgetStaffRole: vi.fn(),
  requireStaff: async () => ({ user: { id: `shop-first-${state.role}` }, role: state.role, db }),
}));
vi.mock("@/lib/db/orders", () => ({ toDomain: async () => ({ id: "PS-100", status: state.status, shopId: state.shopId }) }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseService: () => null }));
vi.mock("@/lib/db/engagement", () => ({ notifyStaff: vi.fn() }));
vi.mock("@/lib/customer-push", () => ({ notifyCustomerOfStatus: vi.fn() }));
vi.mock("@/lib/rider-push", () => ({ pushPendingRiderOffers: vi.fn() }));
vi.mock("@/lib/db/coverage-alert", () => ({ notifyIfNoCoverage: vi.fn() }));

// Real route + real DAL: role comes from authenticated context, not JSON.
import { POST } from "../admin/orders/[id]/advance/route";
const send = (body: unknown) => POST(new Request("http://localhost/api/admin/orders/PS-100/advance", {
  method: "POST", body: JSON.stringify(body),
}), { params: Promise.resolve({ id: "PS-100" }) });
const reason = "Shop unreachable; approved support intervention";
beforeEach(() => {
  state.role = "admin"; state.shopId = "shop-1"; state.status = "pending";
  state.isReturn = false; state.calls = []; state.rpcError = null;
});

describe("shop-first staff advance endpoint", () => {
  it.each(["confirmed", "preparing", "ready-for-pickup"])("denies manager %s even with a reason, flag and forged role", async (to) => {
    state.role = "manager";
    expect((await send({ to, note: reason, fulfilmentOverride: true, role: "super_admin" })).status).toBe(403);
    expect(state.calls).toHaveLength(0);
  });
  it.each([
    { note: reason },
    { note: reason, fulfilmentOverride: "true" },
    { note: "too short", fulfilmentOverride: true },
    { note: " ", fulfilmentOverride: true },
    { note: "x".repeat(301), fulfilmentOverride: true },
  ])("requires explicit emergency intent and a valid reason (%j)", async (input) => {
    expect((await send({ to: "confirmed", ...input })).status).toBe(422);
    expect(state.calls).toHaveLength(0);
  });
  it.each(["admin", "super_admin"])("allows %s emergency fulfilment on its actor-bound client", async (role) => {
    state.role = role;
    expect((await send({ to: "confirmed", note: ` ${reason} `, fulfilmentOverride: true })).status).toBe(200);
    expect(state.calls).toEqual([{ name: "ps_advance_order", args: { p_order_id: "order-uuid", p_to: "confirmed", p_note: reason } }]);
  });
  it("keeps platform-only confirmation and operational cancellation available to manager", async () => {
    state.role = "manager"; state.shopId = null;
    expect((await send({ to: "confirmed" })).status).toBe(200);
    state.shopId = "shop-1";
    expect((await send({ to: "cancelled", note: "Customer requested cancellation" })).status).toBe(200);
    expect(state.calls).toHaveLength(2);
  });
  it("maps SQL reason refusal to 422 without triggering legacy workflow fallbacks", async () => {
    state.rpcError = { code: "P0001", message: "shop fulfilment override reason required (10-300 characters)" };
    expect((await send({ to: "confirmed", note: reason, fulfilmentOverride: true })).status).toBe(422);
    expect(state.calls).toHaveLength(1);
  });
});
