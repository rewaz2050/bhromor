import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ who: [] as string[], ids: [] as string[] }));
vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class extends Error {},
  requireStaff: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff-db" } }),
  requireStaffRole: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff-db" } }),
}));
vi.mock("@/lib/db/rider-gps-flags", () => ({
  getRiderGpsFlags: async (db: { who: string }, id: string) => {
    state.who.push(db.who);
    state.ids.push(id);
    return { ready: true, flags: [], last30Days: 0 };
  },
}));

import { GET } from "../admin/riders/[id]/gps-flags/route";

const ID = "11111111-1111-1111-1111-111111111111";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  state.who = [];
  state.ids = [];
});

describe("/api/admin/riders/:id/gps-flags", () => {
  it("reads on the STAFF client (RLS is the gate) for the requested rider", async () => {
    const res = await GET(new Request("http://localhost/x"), ctx());
    expect(res.status).toBe(200);
    expect(state.who).toEqual(["staff-db"]);
    expect(state.ids).toEqual([ID]);
  });

  it("rejects a malformed id before touching the database", async () => {
    const res = await GET(new Request("http://localhost/x"), ctx("not-an-id"));
    expect(res.status).toBe(422);
    expect(state.who).toEqual([]);
  });
});
