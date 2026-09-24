/**
 * The two status writes that used to reach NOBODY (2026-09-24).
 *
 * The owner's ask was that every step of the order reaches the shopper's own
 * phone, automatically. Staff taps already called `notifyCustomerOfStatus`,
 * and so did the rider's pickup/deliver — but two routes drove the same state
 * machine in silence:
 *
 *   • the VENDOR's advance tap (`/api/vendor/orders/[id]/advance`) — a shop
 *     confirming from its own panel sent nothing;
 *   • the RIDER's accept (`/api/rider/assignments/[id]/accept`) — the moment
 *     `ps_rider_accept` flips the order to `courier-assigned`.
 *
 * This file pins that both now notify, and that both stay harmless when the
 * service key is missing (no notification is never a reason to fail the tap).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  notified: [] as Record<string, unknown>[],
  advanced: [] as { to: string }[],
  accepted: [] as string[],
  ref: null as null | { orderNo: string; phone: string; total: number; status: string },
  serviceAvailable: true,
}));

/* The route wrappers normally check a vendor/rider session; here the handler
   is called directly, which is the only part this test is about. */
vi.mock("@/app/api/vendor/_lib", () => ({
  routeId: async (ctx: unknown) =>
    ((ctx as { params?: Promise<{ id?: string }> })?.params
      ? await (ctx as { params: Promise<{ id?: string }> }).params
      : {}
    )?.id ?? "",
  vendorRoute: (_name: string, handler: (...args: unknown[]) => Promise<Response>) =>
    async (request: Request, ctx: unknown) =>
      handler({ db: { fake: true }, shopId: "shop-1", user: { id: "v1" } }, request, ctx),
}));

vi.mock("@/app/api/rider/_lib", () => ({
  routeId: async (ctx: unknown) =>
    ((ctx as { params?: Promise<{ id?: string }> })?.params
      ? await (ctx as { params: Promise<{ id?: string }> }).params
      : {}
    )?.id ?? "",
  riderRoute: (_name: string, handler: (...args: unknown[]) => Promise<Response>) =>
    async (request: Request, ctx: unknown) =>
      handler({ db: { fake: true }, rider: { id: "r1" } }, request, ctx),
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => (state.serviceAvailable ? { fake: true } : null),
}));

vi.mock("@/lib/customer-push", () => ({
  notifyCustomerOfStatus: async (_db: unknown, input: Record<string, unknown>) => {
    state.notified.push(input);
    return 1;
  },
}));

vi.mock("@/lib/vendor-auth", () => ({ VendorAuthError: class extends Error {} }));
vi.mock("@/lib/rider-auth", () => ({ RiderAuthError: class extends Error {} }));

vi.mock("@/lib/db/vendor", () => ({
  advanceVendorOrder: async (_db: unknown, _shop: string, _no: string, to: string) => {
    state.advanced.push({ to });
    return {
      id: "PS-20260924-0007",
      total: 124000,
      customer: { name: "Rahim", phone: "01712345678" },
    };
  },
}));

vi.mock("@/lib/db/riders", () => ({
  acceptRiderAssignment: async (_db: unknown, id: string) => {
    state.accepted.push(id);
  },
  assignmentOrderRef: async () => state.ref,
}));

import { POST as vendorAdvance } from "../vendor/orders/[id]/advance/route";
import { POST as riderAccept } from "../rider/assignments/[id]/accept/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (body: unknown) =>
  new Request("http://localhost/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  state.notified = [];
  state.advanced = [];
  state.accepted = [];
  state.serviceAvailable = true;
  state.ref = {
    orderNo: "PS-20260924-0007",
    phone: "01712345678",
    total: 124000,
    status: "courier-assigned",
  };
});

describe("every status writer tells the shopper", () => {
  it("a vendor's own confirm tap reaches the customer's phone", async () => {
    const res = await vendorAdvance(
      post({ to: "preparing" }),
      ctx("PS-20260924-0007"),
    );
    expect(res.status).toBe(200);
    expect(state.advanced).toEqual([{ to: "preparing" }]);
    expect(state.notified).toEqual([
      {
        phone: "01712345678",
        orderNo: "PS-20260924-0007",
        status: "preparing",
        total: 124000,
      },
    ]);
  });

  it("a rider accepting the offer announces 'রাইডার নিয়োগ হয়েছে' (courier-assigned)", async () => {
    const res = await riderAccept(post({}), ctx("assignment-1"));
    expect(res.status).toBe(200);
    expect(state.accepted).toEqual(["assignment-1"]);
    // The rider's own RLS scope cannot read the order — the service client
    // resolves it, and the notify happens only after the RPC succeeded.
    expect(state.notified).toEqual([
      {
        phone: "01712345678",
        orderNo: "PS-20260924-0007",
        status: "courier-assigned",
        total: 124000,
      },
    ]);
  });

  it("an unknown assignment notifies nothing and still answers 200", async () => {
    state.ref = null;
    const res = await riderAccept(post({}), ctx("ghost"));
    expect(res.status).toBe(200);
    expect(state.notified).toEqual([]);
  });

  it("without the service key the tap still succeeds — no notification is not a failure", async () => {
    state.serviceAvailable = false;
    expect((await vendorAdvance(post({ to: "confirmed" }), ctx("PS-1"))).status).toBe(200);
    expect((await riderAccept(post({}), ctx("a1"))).status).toBe(200);
    expect(state.notified).toEqual([]);
  });
});
