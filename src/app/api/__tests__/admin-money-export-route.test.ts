import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  roles: null as unknown,
  denied: false,
  service: { who: "service" } as unknown,
  built: [] as { kind: string; from: string; to: string; who: unknown }[],
  truncated: false,
}));

vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class StaffAuthError extends Error { status = 403; },
  requireStaff: async () => ({ user: { id: "staff-1" }, role: "manager", db: {} }),
  requireStaffRole: async (...roles: string[]) => {
    state.roles = roles;
    if (state.denied) { const { StaffAuthError } = await import("@/lib/staff-auth"); throw new StaffAuthError("Admins only.", 403); }
    return { user: { id: "staff-1" }, role: "admin", db: {} };
  },
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseService: () => state.service }));
vi.mock("@/lib/db/money-export", () => ({
  buildMoneyExport: async (who: unknown, kind: string, range: { from: string; to: string }) => {
    state.built.push({ kind, from: range.from, to: range.to, who });
    return { csv: "\uFEFFa,b\r\n", count: 7, truncated: state.truncated };
  },
}));

import { GET } from "../admin/money/export/route";

const get = (qs: string) => (GET as (r: Request) => Promise<Response>)(new Request(`http://localhost/api/admin/money/export?${qs}`));

beforeEach(() => { state.roles = null; state.denied = false; state.built = []; state.truncated = false; state.service = { who: "service" }; });

describe("GET /api/admin/money/export", () => {
  it("is admin-only (managers cannot pull the books)", async () => {
    await get("kind=audit");
    expect(state.roles).toEqual(["admin", "super_admin"]);
    state.denied = true;
    state.built = [];
    expect((await get("kind=audit")).status).toBe(403);
    expect(state.built).toHaveLength(0);
  });

  it("streams a CSV attachment named by ledger and period, reading with the SERVICE client", async () => {
    const res = await get("kind=shop_payouts&from=2026-09-01&to=2026-09-30");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="prosanti-shop-payouts-2026-09-01_to_2026-09-30.csv"');
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("X-Export-Rows")).toBe("7");
    expect(res.headers.get("X-Export-Truncated")).toBe("0");
    expect(await res.text()).toContain("a,b");
    expect(state.built[0]).toMatchObject({ kind: "shop_payouts", who: { who: "service" } });
  });

  it("flags a cut-off export", async () => {
    state.truncated = true;
    expect((await get("kind=audit")).headers.get("X-Export-Truncated")).toBe("1");
  });

  it("422 for an unknown ledger or a bad / reversed / too-long range — nothing is read", async () => {
    expect((await get("kind=users")).status).toBe(422);
    expect((await get("kind=audit&from=2026-10-01&to=2026-09-01")).status).toBe(422);
    expect((await get("kind=audit&from=zzz")).status).toBe(422);
    expect((await get("kind=audit&from=2020-01-01&to=2026-09-01")).status).toBe(422);
    expect(state.built).toHaveLength(0);
  });

  it("503 when the service role is missing", async () => {
    state.service = null;
    expect((await get("kind=audit")).status).toBe(503);
  });
});
