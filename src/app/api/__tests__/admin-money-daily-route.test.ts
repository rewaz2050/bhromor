import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const STAFF_DB = vi.hoisted(() => ({ kind: "staff-jwt" }));
const state = vi.hoisted(() => ({ call: null as null | { db: unknown; day: string }, result: {} as unknown }));

vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class StaffAuthError extends Error {},
  requireStaff: async () => ({ user: { id: "s1", email: "o@x.test" }, db: STAFF_DB, role: "admin" }),
  requireStaffRole: async () => ({ user: { id: "s1", email: "o@x.test" }, db: STAFF_DB, role: "admin" }),
}));
vi.mock("@/lib/db/rider-money", () => ({
  getAdminMoneyDaily: async (db: unknown, day: string) => {
    state.call = { db, day };
    return state.result;
  },
}));

import { GET } from "../admin/money/daily/route";

const get = async (qs = "") => {
  const res = await (GET as unknown as (r: Request) => Promise<Response>)(new Request(`http://localhost/api/admin/money/daily${qs}`));
  return (await res.json()) as { ready: boolean; day: string; report: unknown };
};

beforeEach(() => { state.call = null; state.result = { day: "x" }; });

describe("GET /api/admin/money/daily", () => {
  it("reads with the STAFF client for the requested day", async () => {
    const body = await get("?date=2026-09-15");
    expect(state.call).toEqual({ db: STAFF_DB, day: "2026-09-15" });
    expect(body.ready).toBe(true);
  });

  it("falls back to today for a junk or future date", async () => {
    await get("?date=not-a-date");
    expect(state.call?.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await get("?date=2999-01-01");
    expect((state.call?.day ?? "9999") <= new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10)).toBe(true);
  });

  it("says not-ready before the migration", async () => {
    state.result = null;
    expect((await get()).ready).toBe(false);
  });
});
