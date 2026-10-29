import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ role: "manager", calls: vi.fn(), service: vi.fn() }));
vi.mock("@/lib/staff-auth", () => {
  class StaffAuthError extends Error { status = 403; }
  const staff = () => ({ user: { id: `report-${state.role}` }, role: state.role, db: { actor: state.role } });
  return { StaffAuthError, requireStaff: async () => staff(), requireStaffRole: async (...roles: string[]) => {
    if (!roles.includes(state.role)) throw new StaffAuthError("Forbidden");
    return staff();
  } };
});
vi.mock("@/lib/db/rider-money", () => ({
  getAdminMoneySummary: state.calls, getAdminMoneyPnl: async () => state.calls(),
  listRiderPayoutQueue: state.calls, readRiderPaySettings: state.calls, getAdminMoneyDaily: state.calls,
  // 202610290002: the money page reads the four-eyes threshold (0 = off).
  readFinanceQuorum: async () => 0,
}));
vi.mock("@/lib/db/admin", () => ({ AdminInputError: class extends Error {}, listShopBalances: state.calls,
  listLedgerLines: state.calls, listPayoutLines: state.calls,
  upsertRider: async () => ({ id: "r1", cashInHand: 500, currentLoad: 2, earningsBalance: 1000 }),
  listRidersFull: async () => {
    state.calls(); return [{ id: "r1", cashInHand: 500, currentLoad: 2, earningsBalance: 1000 }];
  },
}));
vi.mock("@/lib/db/reports", () => ({ bestSellers: state.calls, funnelReport: state.calls, FunnelReportMissingError: class extends Error {} }));
vi.mock("@/lib/db/money-audit", () => ({ listMoneyAudit: state.calls }));
vi.mock("@/lib/db/rider-overview", () => ({ getRiderOverview: state.calls }));
vi.mock("@/lib/db/riders", () => ({ listPendingSettleClaims: state.calls }));
vi.mock("@/lib/db/dispatch-settings", () => ({ readDispatchSettings: async () => ({ cashCap: 500000 }) }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseService: () => { state.service(); return {}; } }));
import { GET as money } from "../admin/money/route";
import { GET as audit } from "../admin/money/audit/route";
import { GET as daily } from "../admin/money/daily/route";
import { GET as payouts } from "../admin/payouts/route";
import { GET as overview } from "../admin/riders/[id]/overview/route";
import { GET as riders, POST as saveRider } from "../admin/riders/route";
import { GET as bestSellers } from "../admin/reports/best-sellers/route";
import { GET as funnel } from "../admin/reports/funnel/route";
const reports = { money, audit, daily, payouts, overview, bestSellers, funnel };
const request = () => new Request("http://localhost/api/admin/report");
const context = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };
beforeEach(() => { state.role = "manager"; state.calls.mockReset().mockResolvedValue(null); state.service.mockClear(); });
describe("financial report API boundary (real staffRoute)", () => {
  it.each(Object.entries(reports))("denies Manager %s before database or service access", async (_name, handler) => {
    expect((await handler(request(), context)).status).toBe(403);
    expect(state.calls).not.toHaveBeenCalled(); expect(state.service).not.toHaveBeenCalled();
  });
  it.each(["admin", "super_admin"])("allows %s report reads", async (role) => {
    state.role = role;
    for (const handler of Object.values(reports)) expect((await handler(request(), context)).status).toBe(200);
    expect(state.calls).toHaveBeenCalled();
  });
  it("preserves Manager dispatch roster and cash custody without wallet earnings or financial claim details", async () => {
    const res = await riders(request());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ riders: [{ id: "r1", cashInHand: 500, currentLoad: 2 }], settleClaims: [] });
    const res2 = await riders(request());
    expect((await res2.json()).riders[0]).not.toHaveProperty("earningsBalance");
    expect(state.service).not.toHaveBeenCalled();
  });
});

it("denies Manager rider lifecycle/upsert rather than letting it bypass the review endpoint", async () => {
  const res = await saveRider(new Request("http://localhost/api/admin/riders", { method: "POST", body: "{}" }));
  expect(res.status).toBe(403);
});
it.each(["admin", "super_admin"])("keeps %s rider wallet and financial claims in the authorized roster", async (role) => {
  state.role = role;
  expect((await (await riders(request())).json()).riders[0].earningsBalance).toBe(1000);
  expect(state.service).toHaveBeenCalled();
});
