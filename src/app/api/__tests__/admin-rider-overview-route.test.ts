import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ ids: [] as string[], who: [] as string[], overview: null as unknown }));
vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class extends Error {},
  requireStaff: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff-db" } }),
  requireStaffRole: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff-db" } }),
}));
vi.mock("@/lib/db/rider-overview", () => ({
  getRiderOverview: async (db: { who: string }, id: string) => {
    state.ids.push(id);
    state.who.push(db.who);
    return state.overview;
  },
}));

import { GET } from "../admin/riders/[id]/overview/route";
import { normalizeOverview } from "@/lib/rider-risk";

const ID = "11111111-1111-1111-1111-111111111111";
const call = (id: string) => GET(new Request("http://localhost/x"), { params: Promise.resolve({ id }) });

beforeEach(() => {
  state.ids = [];
  state.who = [];
  state.overview = normalizeOverview({ rider: { id: ID, name: "Rafiq" }, risk: { cashInHand: 450000 } });
});

describe("GET /api/admin/riders/:id/overview", () => {
  it("reads on the staff client and attaches the risk assessment", async () => {
    const res = await call(ID);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(state.who).toEqual(["staff-db"]);
    expect(body.ready).toBe(true);
    expect(body.assessment.level).toBe("high");
  });

  it("ready:false when the migration has not run; 422 on a malformed id", async () => {
    state.overview = null;
    expect(await (await call(ID)).json()).toEqual({ ready: false, overview: null, assessment: null });
    const bad = await call("nope");
    expect(bad.status).toBe(422);
    expect(state.ids).toEqual([ID]);
  });
});
