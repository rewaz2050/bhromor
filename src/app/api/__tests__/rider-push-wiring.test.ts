/**
 * Item I wiring: offers are created in SQL, so the routes that can create them
 * must nudge the rider-push sender right after — and only then. A push failure
 * (or a missing service key) never fails the tap.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  sweeps: [] as { force?: boolean }[],
  coverage: 0,
  announcements: [] as Record<string, unknown>[],
  service: true,
}));

vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class StaffAuthError extends Error {},
  requireStaff: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff" } }),
  requireStaffRole: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff" } }),
}));
vi.mock("@/app/api/vendor/_lib", () => ({
  routeId: async (ctx: unknown) => ((await (ctx as { params: Promise<{ id?: string }> }).params)?.id ?? ""),
  vendorRoute: (_n: string, handler: (...a: unknown[]) => Promise<Response>) =>
    async (req: Request, ctx: unknown) => handler({ db: {}, shopId: "shop-1", user: { id: "v1" } }, req, ctx),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseService: () => (state.service ? { fake: true } : null) }));
vi.mock("@/lib/rider-push", () => ({
  pushPendingRiderOffers: async (_s: unknown, opts: { force?: boolean }) => {
    state.sweeps.push(opts);
    return { claimed: 0, riders: 0 };
  },
  pushRiderAnnouncement: async (_s: unknown, input: Record<string, unknown>) => {
    state.announcements.push(input);
    return 1;
  },
}));
vi.mock("@/lib/db/coverage-alert", () => ({
  notifyIfNoCoverage: async () => {
    state.coverage += 1;
    return false;
  },
}));
vi.mock("@/lib/customer-push", () => ({
  notifyCustomerOfStatus: async () => 1,
  notifyCustomerOfPayment: async () => 1,
}));
vi.mock("@/lib/db/engagement", () => ({ notifyStaff: async () => undefined }));
vi.mock("@/lib/db/admin", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/admin")>();
  const order = { id: "PS-1", total: 5000, customer: { phone: "01712345678" } };
  return {
    ...orig,
    advanceOrderAsStaff: async () => order,
    verifyPaymentAsStaff: async () => order,
  };
});
vi.mock("@/lib/db/vendor", () => ({
  advanceVendorOrder: async () => ({ id: "PS-1", total: 5000, customer: { phone: "01712345678" } }),
  verifyPaymentAsVendor: async () => ({ id: "PS-1", total: 5000, customer: { phone: "01712345678" } }),
}));
vi.mock("@/lib/db/riders", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/riders")>();
  return { ...orig, resolveFailedDelivery: async () => undefined };
});
vi.mock("@/lib/db/rider-inbox", () => ({
  listAnnouncementsForStaff: async () => [],
  listAddressableRiders: async () => [],
  postAnnouncement: async () => "ann-1",
  deleteAnnouncement: async () => undefined,
}));

import { POST as adminAdvance } from "../admin/orders/[id]/advance/route";
import { POST as vendorAdvance } from "../vendor/orders/[id]/advance/route";
import { POST as adminPayment } from "../admin/orders/[id]/payment/route";
import { POST as vendorPayment } from "../vendor/orders/[id]/payment/route";
import { POST as failedDelivery } from "../admin/orders/[id]/failed-delivery/route";
import { POST as announce } from "../admin/rider-announcements/route";

const ctx = { params: Promise.resolve({ id: "PS-1" }) };
const post = (body: unknown) =>
  new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const run = (fn: unknown, body: unknown) => (fn as (r: Request, c: unknown) => Promise<Response>)(post(body), ctx);

beforeEach(() => {
  state.sweeps = [];
  state.coverage = 0;
  state.announcements = [];
  state.service = true;
});

describe("rider push is nudged exactly where offers can appear", () => {
  it("staff + vendor 'Ready' → immediate (forced) sweep; other transitions → none", async () => {
    expect((await run(adminAdvance, { to: "ready-for-pickup" })).status).toBe(200);
    expect((await run(vendorAdvance, { to: "ready-for-pickup" })).status).toBe(200);
    expect(state.sweeps).toEqual([{ force: true }, { force: true }]);
    // S: and the owner is told when nobody can take it
    expect(state.coverage).toBe(2);
    state.sweeps = [];
    state.coverage = 0;
    await run(adminAdvance, { to: "preparing" });
    await run(vendorAdvance, { to: "confirmed" });
    expect(state.sweeps).toEqual([]);
    expect(state.coverage).toBe(0);
  });

  it("a verified wallet payment (staff or shop) makes the order dispatchable → sweep; a rejection does not", async () => {
    await run(adminPayment, { action: "verified" });
    await run(vendorPayment, { action: "verified" });
    expect(state.sweeps).toHaveLength(2);
    state.sweeps = [];
    await run(adminPayment, { action: "rejected" });
    await run(vendorPayment, { action: "rejected" });
    expect(state.sweeps).toEqual([]);
  });

  it("a failed-delivery REDISPATCH sweeps; a cancel does not", async () => {
    await run(failedDelivery, { action: "redispatch" });
    expect(state.sweeps).toEqual([{ force: true }]);
    state.sweeps = [];
    await run(failedDelivery, { action: "cancel", note: "customer unreachable" });
    expect(state.sweeps).toEqual([]);
  });

  it("no service key → the tap still succeeds, nothing is swept", async () => {
    state.service = false;
    expect((await run(adminAdvance, { to: "ready-for-pickup" })).status).toBe(200);
    expect(state.sweeps).toEqual([]);
  });

  it("a posted announcement also pushes, marking important ones", async () => {
    const res = await run(announce, { title: "Settle by 8pm", body: "x", severity: "important", riderId: null });
    expect(res.status).toBe(201);
    expect(state.announcements).toEqual([{ riderId: null, title: "Settle by 8pm", body: "x", important: true }]);
  });
});
