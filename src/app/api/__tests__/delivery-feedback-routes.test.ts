import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  owned: null as unknown,
  save: { status: "saved", riderId: "r1", stars: 1 } as Record<string, unknown>,
  saveThrows: false,
  saved: [] as { orderId: string; input: unknown }[],
  notices: [] as Record<string, unknown>[],
  hidden: [] as { id: string; hidden: boolean }[],
  hideFound: true,
  list: [] as unknown[] | null,
  listOpts: null as unknown,
  serviceMissing: false,
}));

vi.mock("@/lib/env", () => ({ isServiceRoleConfigured: () => true }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true, retryAfterSec: 1 }), clientIpFromHeaders: () => "1.1.1.1" }));
vi.mock("@/lib/db/order-lookup", () => ({ findOwnedOrder: async () => state.owned }));
vi.mock("@/lib/db/engagement", () => ({ notifyStaff: async (_s: unknown, n: Record<string, unknown>) => { state.notices.push(n); } }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () =>
    state.serviceMissing ? null : { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "Rafiq" } }) }) }) }) },
}));
vi.mock("@/lib/db/delivery-feedback", () => ({
  saveDeliveryFeedback: async (_s: unknown, orderId: string, input: unknown) => {
    if (state.saveThrows) throw new Error("db");
    state.saved.push({ orderId, input });
    return state.save;
  },
  listFeedbackForStaff: async (_s: unknown, opts: unknown) => { state.listOpts = opts; return state.list; },
  setFeedbackHidden: async (_s: unknown, id: string, hidden: boolean) => { state.hidden.push({ id, hidden }); return state.hideFound; },
}));
vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class extends Error {},
  requireStaff: async () => ({ user: { id: "s1" }, role: "manager", db: {} }),
  requireStaffRole: async () => ({ user: { id: "s1" }, role: "admin", db: {} }),
}));

import { POST as feedback } from "../track/rate/feedback/route";
import { GET as listGet } from "../admin/rider-feedback/route";
import { PATCH as hidePatch } from "../admin/rider-feedback/[id]/route";

const post = (body: unknown) => new Request("http://localhost/api/track/rate/feedback", { method: "POST", body: JSON.stringify(body) });
const delivered = { id: "order-uuid", status: "delivered", rider_id: "r1" };
const good = { id: "PS-1", phone: "01711111111", tags: ["late"], comment: "slow" };

beforeEach(() => {
  state.owned = delivered;
  state.save = { status: "saved", riderId: "r1", stars: 1 };
  state.saveThrows = false; state.saved = []; state.notices = []; state.hidden = []; state.hideFound = true;
  state.list = []; state.listOpts = null; state.serviceMissing = false;
});

describe("POST /api/track/rate/feedback", () => {
  it("saves for the phone-verified order and rings the staff bell on a low rating", async () => {
    const res = await feedback(post(good));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, already: false });
    expect(state.saved).toEqual([{ orderId: "order-uuid", input: { tags: ["late"], comment: "slow" } }]);
    expect(state.notices[0]).toMatchObject({ title: "1★ delivery — Rafiq", href: "/admin/riders/feedback" });
    expect(String(state.notices[0].body)).toContain("PS-1 · Arrived late");
  });
  it("stays quiet for a happy rating with praise", async () => {
    state.save = { status: "saved", riderId: "r1", stars: 5 };
    await feedback(post({ ...good, tags: ["polite"], comment: "" }));
    expect(state.notices).toHaveLength(0);
  });
  it("404 for the wrong phone (vague), 409 before delivery, 422 for empty feedback, 400 for missing proof", async () => {
    state.owned = null;
    expect((await feedback(post(good))).status).toBe(404);
    state.owned = { ...delivered, status: "confirmed" };
    expect((await feedback(post(good))).status).toBe(409);
    state.owned = delivered;
    expect((await feedback(post({ ...good, tags: [], comment: "" }))).status).toBe(422);
    expect((await feedback(post({ tags: ["late"] }))).status).toBe(400);
    expect(state.saved).toHaveLength(0);
  });
  it("maps no-rating 409, already ok, unavailable 503, thrown 503", async () => {
    state.save = { status: "no-rating" };
    expect((await feedback(post(good))).status).toBe(409);
    state.save = { status: "already" };
    const dup = await feedback(post(good));
    expect(dup.status).toBe(200);
    expect(await dup.json()).toMatchObject({ already: true });
    expect(state.notices).toHaveLength(0);
    state.save = { status: "unavailable" };
    expect((await feedback(post(good))).status).toBe(503);
    state.saveThrows = true;
    expect((await feedback(post(good))).status).toBe(503);
  });
  it("503 without a service client; cross-site posts are refused", async () => {
    state.serviceMissing = true;
    expect((await feedback(post(good))).status).toBe(503);
    state.serviceMissing = false;
    const cross = new Request("http://localhost/x", { method: "POST", headers: { "sec-fetch-site": "cross-site" }, body: JSON.stringify(good) });
    expect((await feedback(cross)).status).toBe(403);
  });
});

describe("admin rider-feedback routes", () => {
  it("GET passes the filters (clamped) and reports a missing migration", async () => {
    await (listGet as (r: Request) => Promise<Response>)(new Request("http://localhost/x?max=2&only=1"));
    expect(state.listOpts).toEqual({ maxStars: 2, onlyWithFeedback: true });
    await (listGet as (r: Request) => Promise<Response>)(new Request("http://localhost/x?max=99"));
    expect(state.listOpts).toEqual({ maxStars: 5, onlyWithFeedback: false });
    state.list = null;
    const res = await (listGet as (r: Request) => Promise<Response>)(new Request("http://localhost/x"));
    expect(await res.json()).toMatchObject({ ready: false, items: [] });
  });
  const ID = "11111111-1111-1111-1111-111111111111";
  const patch = (body: unknown, id = ID) =>
    (hidePatch as (r: Request, c: unknown) => Promise<Response>)(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  it("PATCH hides / shows; validates id and body; 404 when no rating", async () => {
    expect((await patch({ hidden: true })).status).toBe(200);
    expect(state.hidden).toEqual([{ id: ID, hidden: true }]);
    expect((await patch({ hidden: "yes" })).status).toBe(422);
    expect((await patch({ hidden: true }, "nope")).status).toBe(422);
    state.hideFound = false;
    expect((await patch({ hidden: false })).status).toBe(404);
  });
});
