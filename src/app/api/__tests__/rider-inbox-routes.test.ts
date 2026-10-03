/** /api/rider/inbox + /api/admin/rider-announcements (202610020001). */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  calls: [] as string[],
  postError: null as string | null,
}));

vi.mock("@/lib/rider-auth", () => ({
  RiderAuthError: class RiderAuthError extends Error {},
  requireRider: async () => state.ctx,
}));
vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class StaffAuthError extends Error {},
  requireStaff: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff-db" } }),
  requireStaffRole: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff-db" } }),
}));
vi.mock("@/lib/db/rider-inbox", () => ({
  getRiderInbox: async (_s: unknown, id: string) => {
    state.calls.push(`inbox:${id}`);
    return { ready: true, items: [], unread: 2 };
  },
  markRiderInboxRead: async (_s: unknown, id: string) => {
    state.calls.push(`read:${id}`);
  },
  listAnnouncementsForStaff: async () => [],
  listAddressableRiders: async () => [{ id: "r1", name: "Rafiq" }],
  postAnnouncement: async (db: { who: string }, input: { title: string }) => {
    state.calls.push(`post:${db.who}:${input.title}`);
    if (state.postError) throw new Error(state.postError);
    return "ann-1";
  },
  deleteAnnouncement: async (db: { who: string }, id: string) => {
    state.calls.push(`delete:${db.who}:${id}`);
  },
}));

import { GET as riderGet, POST as riderPost } from "../rider/inbox/route";
import { GET as adminGet, POST as adminPost } from "../admin/rider-announcements/route";
import { DELETE as adminDelete } from "../admin/rider-announcements/[id]/route";

const json = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });

beforeEach(() => {
  state.ctx = { rider: { id: "r1" }, service: {}, db: {}, user: { id: "u1" }, email: "r@x.test" };
  state.calls = [];
  state.postError = null;
});

describe("rider inbox routes", () => {
  it("GET and POST are scoped to the session rider", async () => {
    const res = await riderGet(new Request("http://localhost/api/rider/inbox?riderId=other"));
    expect((await res.json()).unread).toBe(2);
    await riderPost(new Request("http://localhost/api/rider/inbox", { method: "POST" }));
    expect(state.calls).toEqual(["inbox:r1", "read:r1"]);
  });
});

describe("admin announcement routes", () => {
  it("lists with the rider picker", async () => {
    const body = await (await adminGet(new Request("http://localhost/api/admin/rider-announcements"))).json();
    expect(body).toMatchObject({ ready: true, items: [], riders: [{ id: "r1", name: "Rafiq" }] });
  });

  it("posts on the staff client and returns 201", async () => {
    const res = await adminPost(json({ title: "Hello", body: "" }));
    expect(res.status).toBe(201);
    expect(state.calls).toEqual(["post:staff-db:Hello"]);
  });

  it("422 on an invalid body; 404 / 403 on database refusals", async () => {
    expect((await adminPost(json({ title: "" }))).status).toBe(422);
    state.postError = "rider_not_found";
    expect((await adminPost(json({ title: "x", riderId: "11111111-1111-1111-1111-111111111111" }))).status).toBe(404);
    state.postError = "forbidden";
    expect((await adminPost(json({ title: "x" }))).status).toBe(403);
  });

  it("deletes by id, refusing a malformed id", async () => {
    const good = "11111111-1111-1111-1111-111111111111";
    const ok = await adminDelete(new Request("http://localhost/x", { method: "DELETE" }), { params: Promise.resolve({ id: good }) });
    expect(ok.status).toBe(200);
    expect(state.calls).toContain(`delete:staff-db:${good}`);
    const bad = await adminDelete(new Request("http://localhost/x", { method: "DELETE" }), { params: Promise.resolve({ id: "nope" }) });
    expect(bad.status).toBe(422);
  });
});
