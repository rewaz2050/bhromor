/** /api/admin/dispatch-settings (J): GET defaults/stored, PATCH strict validation + site_settings upsert. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  rows: [] as { key: string; value: unknown }[] | null,
  upserts: [] as { rows: unknown; opts: unknown }[],
  upsertFails: false,
}));

vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class StaffAuthError extends Error {},
  requireStaff: async () => state.ctx,
  requireStaffRole: async () => state.ctx,
}));

const STAFF_DB = {
  from: () => ({
    select: () => ({
      in: async () => (state.rows ? { data: state.rows, error: null } : { data: null, error: { message: "relation missing" } }),
    }),
    upsert: async (rows: unknown, opts: unknown) => {
      state.upserts.push({ rows, opts });
      return { error: state.upsertFails ? { message: "denied" } : null };
    },
  }),
};

import { GET, PATCH } from "../admin/dispatch-settings/route";

const patch = (body: unknown) =>
  (PATCH as unknown as (r: Request) => Promise<Response>)(
    new Request("http://localhost/api/admin/dispatch-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.ctx = { user: { id: "staff-1", email: "a@x.test" }, db: STAFF_DB, role: "admin" };
  state.rows = [];
  state.upserts = [];
  state.upsertFails = false;
});

describe("/api/admin/dispatch-settings", () => {
  it("GET answers the old defaults when nothing is stored, or the table is missing", async () => {
    const get = GET as unknown as (r: Request) => Promise<Response>;
    expect((await (await get(new Request("http://localhost/x"))).json()).settings).toEqual({ cashCap: 500000, offerTtl: 90, maxAttempts: 2, loadLimit: 2 });
    state.rows = null;
    expect((await (await get(new Request("http://localhost/x"))).json()).settings.cashCap).toBe(500000);
  });

  it("GET reads stored values (numbers or strings), clamping strays", async () => {
    state.rows = [
      { key: "rider_cash_cap_paisa", value: 250000 },
      { key: "offer_ttl_seconds", value: "60" },
      { key: "delivery_max_attempts", value: 99 },
    ];
    const body = await (await (GET as unknown as (r: Request) => Promise<Response>)(new Request("http://localhost/x"))).json();
    expect(body.settings).toEqual({ cashCap: 250000, offerTtl: 60, maxAttempts: 5, loadLimit: 2 });
  });

  it("PATCH upserts the four flat keys with the staff client", async () => {
    const res = await patch({ settings: { cashCap: 300000, offerTtl: 60, maxAttempts: 3 } });
    expect(res.status).toBe(200);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0].opts).toEqual({ onConflict: "key" });
    expect(state.upserts[0].rows).toEqual([
      { key: "rider_cash_cap_paisa", value: 300000 },
      { key: "offer_ttl_seconds", value: 60 },
      { key: "delivery_max_attempts", value: 3 },
      { key: "rider_load_limit", value: 2 },
    ]);
    expect((await res.json()).settings).toEqual({ cashCap: 300000, offerTtl: 60, maxAttempts: 3, loadLimit: 2 });
  });

  it("PATCH saves a chosen load limit", async () => {
    const res = await patch({ settings: { cashCap: 300000, offerTtl: 60, maxAttempts: 3, loadLimit: 4 } });
    expect(res.status).toBe(200);
    expect(state.upserts[0].rows).toContainEqual({ key: "rider_load_limit", value: 4 });
  });

  it("PATCH refuses out-of-range / partial input with 422 and writes nothing", async () => {
    for (const settings of [
      { cashCap: 1000, offerTtl: 60, maxAttempts: 3 },
      { cashCap: 300000, offerTtl: 5, maxAttempts: 3 },
      { cashCap: 300000, offerTtl: 60 },
      { cashCap: 300000, offerTtl: 60, maxAttempts: 3, loadLimit: 9 },
      {},
    ]) {
      const res = await patch({ settings });
      expect(res.status).toBe(422);
    }
    expect(state.upserts).toHaveLength(0);
  });

  it("PATCH reports a failed write instead of pretending it saved", async () => {
    state.upsertFails = true;
    const res = await patch({ settings: { cashCap: 300000, offerTtl: 60, maxAttempts: 3 } });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });
});
