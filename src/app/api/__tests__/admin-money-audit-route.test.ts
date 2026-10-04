import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const STAFF_DB = vi.hoisted(() => ({ kind: "staff-jwt" }));
const state = vi.hoisted(() => ({ call: null as null | { db: unknown; opts: unknown }, result: [] as unknown }));

vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class StaffAuthError extends Error {},
  requireStaff: async () => ({ user: { id: "s1", email: "o@x.test" }, db: STAFF_DB, role: "admin" }),
  requireStaffRole: async () => ({ user: { id: "s1", email: "o@x.test" }, db: STAFF_DB, role: "admin" }),
}));
vi.mock("@/lib/db/money-audit", () => ({
  listMoneyAudit: async (db: unknown, opts: unknown) => {
    state.call = { db, opts };
    return state.result;
  },
}));

import { GET } from "../admin/money/audit/route";

const get = async (qs = "") => {
  const res = await (GET as unknown as (r: Request) => Promise<Response>)(new Request(`http://localhost/api/admin/money/audit${qs}`));
  return (await res.json()) as { ready: boolean; event: string | null; entries: unknown[] };
};

beforeEach(() => { state.call = null; state.result = []; });

describe("GET /api/admin/money/audit", () => {
  it("reads with the STAFF client (RLS is admin-only) and a clamped limit", async () => {
    await get("?limit=9999");
    expect(state.call?.db).toBe(STAFF_DB);
    expect(state.call?.opts).toEqual({ event: null, limit: 200 });
  });

  it("passes a known event and ignores an unknown one", async () => {
    expect((await get("?event=shop_payout")).event).toBe("shop_payout");
    expect((await get("?event=nope")).event).toBeNull();
  });

  it("says not-ready before the migration", async () => {
    state.result = null;
    const body = await get();
    expect(body.ready).toBe(false);
    expect(body.entries).toEqual([]);
  });
});
