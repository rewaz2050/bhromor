import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const STAFF_DB = vi.hoisted(() => ({ kind: "staff-jwt" }));
const state = vi.hoisted(() => ({
  role: "admin" as string,
  mode: 0 as 0 | 1 | 2,
  writes: [] as { db: unknown; raw: unknown }[],
  listed: [] as { db: unknown; id: string }[],
  resolved: [] as string[],
}));

vi.mock("@/lib/staff-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/staff-auth")>("@/lib/staff-auth");
  const ctx = () => ({ user: { id: "staff-1" }, db: STAFF_DB, role: state.role });
  return {
    ...actual,
    requireStaff: async () => ctx(),
    requireStaffRole: async (_roles: unknown) => {
      const roles = (_roles ?? []) as string[];
      if (roles.length && !roles.includes(state.role)) throw new actual.StaffAuthError("Not allowed.", 403);
      return ctx();
    },
  };
});
vi.mock("@/lib/db/failed-proof", () => ({
  readFailedProofMode: async () => state.mode,
  writeFailedProofMode: async (db: unknown, raw: unknown) => {
    state.writes.push({ db, raw });
    return raw;
  },
  listFailedProofs: async (db: unknown, id: string) => {
    state.listed.push({ db, id });
    return { ready: true, proofs: [] };
  },
}));
vi.mock("@/lib/db/riders", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/riders")>();
  return {
    ...orig,
    resolveOrderRowIds: async (_db: unknown, refs: string[]) => {
      state.resolved.push(...refs);
      return refs.map(() => "11111111-1111-1111-1111-111111111111");
    },
  };
});

import { GET as getMode, PATCH as setMode } from "../admin/riders/failed-proof/route";
import { GET as getProofs } from "../admin/orders/[id]/failed-proof/route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  state.role = "admin";
  state.mode = 0;
  state.writes = [];
  state.listed = [];
  state.resolved = [];
});

describe("/api/admin/riders/failed-proof", () => {
  it("GET answers the current mode (off by default)", async () => {
    expect(await (await getMode(new Request("http://localhost/x"), undefined)).json()).toEqual({ mode: 0 });
  });
  it("PATCH writes through the STAFF client", async () => {
    const res = await setMode(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ mode: 2 }) }), undefined);
    expect(res.status).toBe(200);
    expect(state.writes).toEqual([{ db: STAFF_DB, raw: 2 }]);
  });
  it("PATCH is for admins only — a manager is refused and nothing is written", async () => {
    state.role = "manager";
    const res = await setMode(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify({ mode: 2 }) }), undefined);
    expect(res.status).toBe(403);
    expect(state.writes).toHaveLength(0);
  });
});

describe("/api/admin/orders/:id/failed-proof", () => {
  it("accepts the public order number and reads on the staff client", async () => {
    const res = await getProofs(new Request("http://localhost/x"), ctx("PS-1001"));
    expect(res.status).toBe(200);
    expect(state.resolved).toEqual(["PS-1001"]);
    expect(state.listed).toEqual([{ db: STAFF_DB, id: "11111111-1111-1111-1111-111111111111" }]);
  });
});
