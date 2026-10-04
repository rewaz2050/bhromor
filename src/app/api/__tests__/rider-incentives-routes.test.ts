/** Item V routes: rider reads own picture on the service client; admins read/write settings on THEIR client. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  view: null as unknown,
  rolesAsked: [] as unknown[],
  riderCalls: [] as { who: unknown; id: string }[],
  wrote: [] as { who: unknown; raw: unknown }[],
}));

vi.mock("@/lib/rider-auth", () => ({ RiderAuthError: class extends Error {}, requireRider: async () => state.ctx }));
vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class extends Error {},
  requireStaff: async () => ({ user: { id: "s1" }, role: "admin", db: { who: "staff-db" } }),
  requireStaffRole: async (...roles: unknown[]) => {
    state.rolesAsked.push(roles);
    return { user: { id: "s1" }, role: "admin", db: { who: "staff-db" } };
  },
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseService: () => ({ who: "service" }) }));
vi.mock("@/lib/db/rider-incentives", async () => {
  const { AdminInputError } = await import("@/lib/db/admin");
  const { INCENTIVE_DEFAULTS } = await import("@/lib/rider-incentives");
  return {
    getRiderIncentives: async (service: unknown, id: string) => {
      state.riderCalls.push({ who: service, id });
      return state.view;
    },
    readIncentiveSettings: async () => INCENTIVE_DEFAULTS,
    writeIncentiveSettings: async (db: unknown, raw: Record<string, unknown>) => {
      if (raw.dailyTarget === 3) throw new AdminInputError("Set both.", 422);
      state.wrote.push({ who: db, raw });
      return { dailyTarget: 8, dailyBonus: 5000, referralBonus: 0, referralAfter: 10 };
    },
  };
});

import { GET as riderGet } from "../rider/incentives/route";
import { GET as adminGet, PATCH as adminPatch } from "../admin/riders/incentives/route";

const req = (body?: unknown) =>
  new Request("http://localhost/x", { method: body ? "PATCH" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => {
  state.ctx = { rider: { id: "r1" }, service: { who: "service" }, db: { who: "rider-db" }, user: { id: "u1" }, email: "r@x.test" };
  state.view = null;
  state.rolesAsked = [];
  state.riderCalls = [];
  state.wrote = [];
});

describe("GET /api/rider/incentives", () => {
  it("reads the rider's OWN id on the service client", async () => {
    state.view = { settings: {}, today: null };
    const res = await (riderGet as (r: Request) => Promise<Response>)(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ready: true });
    expect(state.riderCalls).toEqual([{ who: { who: "service" }, id: "r1" }]);
  });
  it("says ready:false while the migration is missing", async () => {
    const body = await (await (riderGet as (r: Request) => Promise<Response>)(req())).json();
    expect(body).toEqual({ ready: false, view: null });
  });
});

describe("/api/admin/riders/incentives", () => {
  it("GET returns the settings", async () => {
    const body = await (await (adminGet as unknown as (r: Request) => Promise<Response>)(req())).json();
    expect(body.settings.dailyTarget).toBe(0);
  });
  it("PATCH writes on the staff client, admin roles only", async () => {
    const res = await (adminPatch as unknown as (r: Request) => Promise<Response>)(req({ dailyTarget: 8, dailyBonusTaka: 50, referralBonusTaka: 0, referralAfter: 10 }));
    expect(res.status).toBe(200);
    expect(state.wrote[0].who).toEqual({ who: "staff-db" });
    expect(state.rolesAsked.at(-1)).toEqual(["admin", "super_admin"]);
  });
  it("PATCH keeps the 422 of a refused configuration", async () => {
    const res = await (adminPatch as unknown as (r: Request) => Promise<Response>)(req({ dailyTarget: 3 }));
    expect(res.status).toBe(422);
    expect(state.wrote).toHaveLength(0);
  });
});
