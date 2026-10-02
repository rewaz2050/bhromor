import { beforeEach, describe, expect, it, vi } from "vitest";
import { RiderInputError } from "@/lib/db/riders";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ set: [] as unknown[][], who: [] as string[], fail: null as Error | null }));
vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class extends Error {},
  requireStaff: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff-db" } }),
  requireStaffRole: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff-db" } }),
}));
vi.mock("@/lib/db/licence-expiry", () => ({
  getRiderLicence: async (db: { who: string }) => {
    state.who.push(db.who);
    return state.fail ? Promise.reject(state.fail) : { riderId: "r", vehicle: "bike", expiresOn: "2028-01-01", status: { kind: "ok", daysLeft: 400, blocked: false } };
  },
  setRiderLicenceExpiry: async (db: { who: string }, ...args: unknown[]) => {
    state.who.push(db.who);
    state.set.push(args);
    if (state.fail) throw state.fail;
    return { riderId: "r", vehicle: "bike", expiresOn: args[1], status: { kind: "ok", daysLeft: 400, blocked: false } };
  },
}));

import { GET, PATCH } from "../admin/riders/[id]/licence/route";

const ID = "11111111-1111-1111-1111-111111111111";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) });
const patch = (body: unknown, id = ID) =>
  PATCH(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) }), ctx(id));

beforeEach(() => {
  state.set = [];
  state.who = [];
  state.fail = null;
});

describe("/api/admin/riders/:id/licence", () => {
  it("GET reads on the staff client", async () => {
    const res = await GET(new Request("http://localhost/x"), ctx());
    expect(res.status).toBe(200);
    expect((await res.json()).ready).toBe(true);
    expect(state.who).toEqual(["staff-db"]);
  });

  it("PATCH records or clears the date on the staff client", async () => {
    expect((await patch({ expiresOn: " 2028-01-01 " })).status).toBe(200);
    expect((await patch({ expiresOn: null })).status).toBe(200);
    expect(state.set.map((a) => a[1])).toEqual(["2028-01-01", null]);
    expect(new Set(state.who)).toEqual(new Set(["staff-db"]));
  });

  it("422 on a malformed id or body; domain errors keep their status", async () => {
    expect((await patch({ expiresOn: "2028-01-01" }, "nope")).status).toBe(422);
    expect((await patch({})).status).toBe(422);
    expect((await patch({ expiresOn: 5 })).status).toBe(422);
    state.fail = new RiderInputError("Licence tracking isn't switched on yet", 503);
    expect((await patch({ expiresOn: "2028-01-01" })).status).toBe(503);
    state.fail = new RiderInputError("Rider not found.", 404);
    expect((await GET(new Request("http://localhost/x"), ctx())).status).toBe(404);
  });
});
