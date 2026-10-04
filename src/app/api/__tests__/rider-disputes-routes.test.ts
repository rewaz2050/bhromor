/** Item W routes: the rider raises on their own JWT; staff decide / adjust on theirs; the rider is told. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RiderInputError } from "@/lib/db/riders";
import { AdminInputError } from "@/lib/db/admin";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  raised: [] as { who: string; input: unknown }[],
  resolved: [] as { who: string; id: string; input: unknown }[],
  adjusted: [] as { who: string; id: string; input: unknown }[],
  staffNotices: [] as Record<string, unknown>[],
  announced: [] as { who: string; input: Record<string, unknown> }[],
  pushed: [] as Record<string, unknown>[],
  fail: null as Error | null,
  announceFails: false,
}));

vi.mock("@/lib/rider-auth", () => ({ RiderAuthError: class extends Error {}, requireRider: async () => state.ctx }));
vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class extends Error {},
  requireStaff: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff-db" } }),
  requireStaffRole: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff-db" } }),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseService: () => ({ who: "service" }) }));
vi.mock("@/lib/db/engagement", () => ({ notifyStaff: async (_db: unknown, n: Record<string, unknown>) => { state.staffNotices.push(n); } }));
vi.mock("@/lib/rider-push", () => ({ pushRiderAnnouncement: async (_s: unknown, input: Record<string, unknown>) => { state.pushed.push(input); return 1; } }));
vi.mock("@/lib/db/rider-inbox", () => ({
  postAnnouncement: async (db: { who: string }, input: Record<string, unknown>) => {
    if (state.announceFails) throw new Error("inbox down");
    state.announced.push({ who: db.who, input });
    return "ann-1";
  },
}));
vi.mock("@/lib/db/rider-disputes", () => ({
  listRiderDisputes: async () => ({ ready: true, items: [] }),
  listDisputesForStaff: async () => [],
  raiseRiderDispute: async (db: { who: string }, input: unknown) => {
    if (state.fail) throw state.fail;
    state.raised.push({ who: db.who, input });
    return { id: "d1" };
  },
  resolveDispute: async (db: { who: string }, id: string, input: { amount: number }) => {
    if (state.fail) throw state.fail;
    state.resolved.push({ who: db.who, id, input });
    return { id, riderId: "r1", adjustmentAmount: input.amount };
  },
  adjustRiderWallet: async (db: { who: string }, id: string, input: unknown) => {
    if (state.fail) throw state.fail;
    state.adjusted.push({ who: db.who, id, input });
    return { id: "e1", amount: 1 };
  },
}));

import { POST as raise } from "../rider/disputes/route";
import { POST as resolve } from "../admin/rider-disputes/[id]/route";
import { POST as adjust } from "../admin/riders/[id]/adjust/route";

const ID = "11111111-1111-1111-1111-111111111111";
const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  state.ctx = { rider: { id: "r1", name: "Rafiq" }, service: { who: "service" }, db: { who: "rider-db" }, user: { id: "u1" }, email: "r@x.test" };
  for (const k of ["raised", "resolved", "adjusted", "staffNotices", "announced", "pushed"] as const) (state[k] as unknown[]).length = 0;
  state.fail = null;
  state.announceFails = false;
});

describe("POST /api/rider/disputes", () => {
  it("raises on the RIDER's client, rings the staff bell with the category", async () => {
    const res = await (raise as (r: Request) => Promise<Response>)(post({ category: "missing_fee", message: "fee not credited", assignmentId: ID, claimedTaka: 40 }));
    expect(res.status).toBe(201);
    expect(state.raised).toEqual([{ who: "rider-db", input: { assignmentId: ID, category: "missing_fee", message: "fee not credited", claimed: 4000 } }]);
    expect(state.staffNotices[0]).toMatchObject({ href: "/admin/riders/disputes" });
    expect(String(state.staffNotices[0].title)).toContain("Rafiq");
    expect(String(state.staffNotices[0].body)).toContain("Delivery fee missing");
  });
  it("422 on a bad body (nothing raised, nobody notified); domain errors keep their status", async () => {
    expect((await (raise as (r: Request) => Promise<Response>)(post({ category: "nope", message: "fee not credited" }))).status).toBe(422);
    expect(state.raised).toHaveLength(0);
    state.fail = new RiderInputError("dup", 409);
    expect((await (raise as (r: Request) => Promise<Response>)(post({ category: "other", message: "something odd" }))).status).toBe(409);
    expect(state.staffNotices).toHaveLength(0);
  });
});

describe("POST /api/admin/rider-disputes/:id", () => {
  it("decides on the STAFF client and tells the rider (inbox + push) what happened to their money", async () => {
    const res = await resolve(post({ decision: "approve", amountTaka: 40, note: "Fee missed" }), ctx());
    expect(res.status).toBe(200);
    expect(state.resolved).toEqual([{ who: "staff-db", id: ID, input: { decision: "approve", amount: 4000, note: "Fee missed" } }]);
    expect(state.announced[0]).toMatchObject({ who: "staff-db", input: { riderId: "r1", severity: "info" } });
    expect(String(state.announced[0].input.body)).toContain("৳40 যোগ হয়েছে");
    expect(state.pushed[0]).toMatchObject({ riderId: "r1", important: false });
  });
  it("the decision stands even if telling the rider fails", async () => {
    state.announceFails = true;
    expect((await resolve(post({ decision: "reject", note: "Fee was paid" }), ctx())).status).toBe(200);
    expect(state.resolved).toHaveLength(1);
  });
  it("422 for a bad id / missing reason; already-decided keeps 409", async () => {
    expect((await resolve(post({ decision: "approve" }), ctx("nope"))).status).toBe(422);
    expect((await resolve(post({ decision: "reject", note: "" }), ctx())).status).toBe(422);
    expect(state.resolved).toHaveLength(0);
    state.fail = new AdminInputError("already", 409);
    expect((await resolve(post({ decision: "approve" }), ctx())).status).toBe(409);
    expect(state.announced).toHaveLength(0);
  });
});

describe("POST /api/admin/riders/:id/adjust", () => {
  it("adjusts on the staff client, in paisa, and tells the rider", async () => {
    const res = await adjust(post({ amountTaka: -15.5, note: "Damaged parcel" }), ctx());
    expect(res.status).toBe(201);
    expect(state.adjusted).toEqual([{ who: "staff-db", id: ID, input: { amount: -1550, note: "Damaged parcel" } }]);
    expect(String(state.announced[0].input.body)).toContain("−৳15.50");
  });
  it("refuses zero, no reason, a bad id — before touching the wallet", async () => {
    expect((await adjust(post({ amountTaka: 0, note: "Damaged parcel" }), ctx())).status).toBe(422);
    expect((await adjust(post({ amountTaka: 5, note: "no" }), ctx())).status).toBe(422);
    expect((await adjust(post({ amountTaka: 5, note: "Eid bonus" }), ctx("bad"))).status).toBe(422);
    expect(state.adjusted).toHaveLength(0);
  });
  it("an overdraw refusal reaches the admin as 422", async () => {
    state.fail = new AdminInputError("That debit is bigger than the rider's wallet balance.", 422);
    expect((await adjust(post({ amountTaka: -999, note: "Big penalty" }), ctx())).status).toBe(422);
    expect(state.announced).toHaveLength(0);
  });
});
