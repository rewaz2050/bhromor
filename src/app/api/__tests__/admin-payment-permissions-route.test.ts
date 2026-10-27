import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ role: "admin", decisions: [] as unknown[][] }));
vi.mock("@/lib/staff-auth", () => {
  class StaffAuthError extends Error { status = 403; }
  const staff = () => ({ user: { id: `payment-${state.role}` }, role: state.role, db: { who: "actor-db" } });
  return {
    StaffAuthError,
    requireStaff: async () => staff(),
    requireStaffRole: async (...roles: string[]) => {
      if (!roles.includes(state.role)) throw new StaffAuthError("Forbidden");
      return staff();
    },
  };
});
vi.mock("@/lib/db/admin", () => ({
  AdminInputError: class extends Error {},
  verifyPaymentAsStaff: async (...args: unknown[]) => {
    state.decisions.push(args);
    return { id: "PS-100", total: 10000 };
  },
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseService: () => null }));
vi.mock("@/lib/db/engagement", () => ({ notifyStaff: vi.fn() }));
vi.mock("@/lib/customer-push", () => ({ notifyCustomerOfPayment: vi.fn() }));
vi.mock("@/lib/rider-push", () => ({ pushPendingRiderOffers: vi.fn() }));

import { POST } from "../admin/orders/[id]/payment/route";
const decide = () => POST(new Request("http://localhost/api/admin/orders/PS-100/payment", {
  method: "POST", body: JSON.stringify({ action: "verified", note: "Checked wallet" }),
}), { params: Promise.resolve({ id: "PS-100" }) });

beforeEach(() => { state.role = "admin"; state.decisions = []; });
describe("platform payment approval boundary", () => {
  it("returns 403 for manager before calling financial code", async () => {
    state.role = "manager";
    expect((await decide()).status).toBe(403);
    expect(state.decisions).toHaveLength(0);
  });
  it.each(["admin", "super_admin"])("allows %s with the actor-bound database client", async (role) => {
    state.role = role;
    expect((await decide()).status).toBe(200);
    expect(state.decisions).toEqual([[{ who: "actor-db" }, "PS-100", "verified", "Checked wallet"]]);
  });
});
