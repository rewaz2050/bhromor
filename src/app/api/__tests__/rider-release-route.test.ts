/**
 * POST /api/rider/assignments/:id/release (202610020011): the real riderRoute
 * wrapper runs; the session, the DB layer and the staff bell are faked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const RIDER_DB = vi.hoisted(() => ({ kind: "rider-jwt" }));
const SERVICE = vi.hoisted(() => ({ kind: "service-role" }));
const state = vi.hoisted(() => ({
  releases: [] as { db: unknown; id: string; reason: string }[],
  bells: [] as { db: unknown; notice: { title: string; body?: string } }[],
  fail: null as Error | null,
  bellFails: false,
}));

vi.mock("@/lib/rider-auth", () => ({
  RiderAuthError: class RiderAuthError extends Error {},
  requireRider: async () => ({
    rider: { id: "r1", name: "Karim" },
    db: RIDER_DB,
    service: SERVICE,
    user: { id: "u-release-route" },
    email: "r@example.com",
  }),
}));
vi.mock("@/lib/db/engagement", () => ({
  notifyStaff: async (db: unknown, notice: { title: string; body?: string }) => {
    if (state.bellFails) throw new Error("bell down");
    state.bells.push({ db, notice });
  },
}));
vi.mock("@/lib/db/riders", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/riders")>();
  return {
    ...orig,
    releaseAcceptedAssignment: async (db: unknown, id: string, reason: string) => {
      if (state.fail) throw state.fail;
      state.releases.push({ db, id, reason });
    },
    assignmentOrderRef: async () => ({ orderNo: "PS-1001", phone: "017", total: 1, status: "ready-for-pickup" }),
  };
});

import { POST } from "../rider/assignments/[id]/release/route";
import { RiderInputError } from "@/lib/db/riders";

const call = (body: unknown, id = "asg-1") =>
  (POST as unknown as (r: Request, c: unknown) => Promise<Response>)(
    new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );

beforeEach(() => {
  state.releases = [];
  state.bells = [];
  state.fail = null;
  state.bellFails = false;
});

describe("/api/rider/assignments/:id/release", () => {
  it("runs the RPC on the RIDER's client with the trimmed reason and bells staff via the service client", async () => {
    const res = await call({ reason: "  bike broke down  " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ released: true });
    expect(state.releases).toEqual([{ db: RIDER_DB, id: "asg-1", reason: "bike broke down" }]);
    expect(state.bells).toHaveLength(1);
    expect(state.bells[0].db).toBe(SERVICE);
    expect(state.bells[0].notice.title).toContain("PS-1001");
    expect(state.bells[0].notice.body).toContain("Karim");
  });
  it("refuses a missing or too-short reason with 422 before touching the database", async () => {
    for (const body of [{}, { reason: "abc" }, { reason: 12345 }]) {
      expect((await call(body)).status).toBe(422);
    }
    expect(state.releases).toHaveLength(0);
    expect(state.bells).toHaveLength(0);
  });
  it("passes the database's refusal through and sends no bell", async () => {
    state.fail = new RiderInputError("too late", 409);
    const res = await call({ reason: "bike broke down" });
    expect(res.status).toBe(409);
    expect(state.bells).toHaveLength(0);
  });
  it("a failing bell never undoes a hand-back that already happened", async () => {
    state.bellFails = true;
    const res = await call({ reason: "bike broke down" });
    expect(res.status).toBe(200);
    expect(state.releases).toHaveLength(1);
  });
});
