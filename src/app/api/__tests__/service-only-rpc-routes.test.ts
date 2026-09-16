/**
 * 202609160004 revoked EXECUTE on ps_return_action and ps_expire_stale_offers
 * from anon/authenticated (the public anon key must not approve returns or
 * churn the dispatch board). Two staff routes used to call them on the
 * staff's RLS-bound JWT client, which would now fail with "permission denied
 * for function". These pin that they run on the service client after the
 * staff check — and that the dispatch board still renders without a service
 * key (the sweep is best-effort there).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  staffRpcs: [] as string[],
  serviceRpcs: [] as string[],
  serviceAvailable: true,
  /** What the service client's rpc() answers (batch assign tests). */
  serviceRpcResult: { data: 0 as unknown, error: null as null | { message: string; code?: string } },
}));

const table = (rows: unknown[]) => {
  const obj: Record<string, unknown> = { data: rows, error: null };
  for (const m of ["select", "eq", "in", "order", "limit", "or"]) obj[m] = () => obj;
  obj.maybeSingle = async () => ({ data: rows[0] ?? null, error: null });
  obj.single = async () => ({ data: rows[0] ?? null, error: null });
  obj.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: rows, error: null }).then(resolve);
  return obj;
};

const client = (log: string[]) => ({
  from: (name: string) =>
    table(name === "orders" ? [{ id: "11111111-1111-4111-8111-111111111111" }] : []),
  rpc: async (fn: string) => {
    log.push(fn);
    return log === state.serviceRpcs ? state.serviceRpcResult : { data: 0, error: null };
  },
});

vi.mock("@/lib/staff-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/staff-auth")>("@/lib/staff-auth");
  return {
    ...actual,
    requireStaff: async () => ({
      user: { id: "staff-1", email: "s@x.com" },
      role: "admin",
      db: client(state.staffRpcs),
    }),
  };
});

vi.mock("@/lib/supabase-server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/supabase-server")>(
    "@/lib/supabase-server",
  );
  return {
    ...actual,
    getSupabaseService: () =>
      state.serviceAvailable ? client(state.serviceRpcs) : null,
  };
});

vi.mock("@/lib/db/engagement", () => ({ notifyStaff: async () => {} }));

beforeEach(() => {
  state.staffRpcs = [];
  state.serviceRpcs = [];
  state.serviceAvailable = true;
  state.serviceRpcResult = { data: 0, error: null };
});

describe("return action route", () => {
  it("runs ps_return_action on the service client, never the staff JWT client", async () => {
    const { POST } = await import("../admin/orders/[id]/return/route");
    const res = await POST(
      new Request("http://localhost/api/admin/orders/PS-20260916-0001/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      }),
      { params: Promise.resolve({ id: "PS-20260916-0001" }) },
    );
    expect(res.status).toBe(200);
    expect(state.serviceRpcs).toEqual(["ps_return_action"]);
    expect(state.staffRpcs).toEqual([]);
  });

  it("answers an honest 503 when the service key is missing", async () => {
    state.serviceAvailable = false;
    const { POST } = await import("../admin/orders/[id]/return/route");
    const res = await POST(
      new Request("http://localhost/api/admin/orders/PS-20260916-0001/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject" }),
      }),
      { params: Promise.resolve({ id: "PS-20260916-0001" }) },
    );
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toMatch(/SERVICE_ROLE/);
  });
});

describe("dispatch board route", () => {
  it("sweeps stale offers on the service client and reads the board with the staff client", async () => {
    const { GET } = await import("../admin/deliveries/route");
    const res = await GET(new Request("http://localhost/api/admin/deliveries"));
    expect(res.status).toBe(200);
    expect(state.serviceRpcs).toEqual(["ps_expire_stale_offers"]);
    expect(state.staffRpcs).toEqual([]);
  });

  it("still renders the board when no service key is configured", async () => {
    state.serviceAvailable = false;
    const { GET } = await import("../admin/deliveries/route");
    const res = await GET(new Request("http://localhost/api/admin/deliveries"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { deliveries: unknown[]; awaitingOrders: unknown[] };
    expect(body.deliveries).toEqual([]);
    expect(state.staffRpcs).toEqual([]);
  });
});

describe("batch assign route (202609160005)", () => {
  const RIDER = "22222222-2222-4222-8222-222222222222";
  const ORDERS = ["11111111-1111-4111-8111-111111111111", "33333333-3333-4333-8333-333333333333"];
  const post = (body: unknown) =>
    new Request("http://localhost/api/admin/deliveries/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("calls ps_assign_batch_to_rider once on the service client and returns its count", async () => {
    state.serviceRpcResult = { data: 2, error: null };
    const { POST } = await import("../admin/deliveries/batch/route");
    const res = await POST(post({ riderId: RIDER, orderIds: ORDERS }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ assigned: 2 });
    // One RPC for the whole batch — no per-order fallback to a phantom
    // ps_assign_order_to_rider (the pre-0005 route looped over one that
    // never existed and reported success anyway).
    expect(state.serviceRpcs).toEqual(["ps_assign_batch_to_rider"]);
    expect(state.staffRpcs).toEqual([]);
  });

  it("surfaces the function's own rules (offline rider) as 409, not as a silent 0", async () => {
    state.serviceRpcResult = { data: null, error: { message: "rider not available", code: "P0001" } };
    const { POST } = await import("../admin/deliveries/batch/route");
    const res = await POST(post({ riderId: RIDER, orderIds: ORDERS }));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("rider not available");
  });

  it("names the 0005 repair when the database still has the phantom dependency", async () => {
    state.serviceRpcResult = {
      data: null,
      error: { message: 'relation "rider_assignments" does not exist', code: "42P01" },
    };
    const { POST } = await import("../admin/deliveries/batch/route");
    const res = await POST(post({ riderId: RIDER, orderIds: ORDERS }));
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain("202609160005_dispatch_reoffer_repair.sql");
  });

  it("validates input before touching the database", async () => {
    const { POST } = await import("../admin/deliveries/batch/route");
    expect((await POST(post({ riderId: RIDER, orderIds: [] }))).status).toBe(422);
    expect((await POST(post({ riderId: "not-a-uuid", orderIds: ORDERS }))).status).toBe(422);
    expect((await POST(post({ riderId: RIDER, orderIds: [...ORDERS, ...ORDERS, ...ORDERS] }))).status).toBe(422);
    expect(state.serviceRpcs).toEqual([]);
  });
});
