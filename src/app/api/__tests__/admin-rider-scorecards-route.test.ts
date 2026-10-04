import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({
  cards: [] as unknown[] | null,
  auto: false,
  who: [] as string[],
  written: [] as boolean[],
}));
vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class extends Error {},
  requireStaff: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff-db" } }),
  requireStaffRole: async () => ({ user: { id: "staff-1" }, role: "admin", db: { who: "staff-db" } }),
}));
vi.mock("@/lib/db/dispatch-settings", () => ({ readDispatchSettings: async () => ({ cashCap: 500000, offerTtl: 90, maxAttempts: 2, loadLimit: 2, failedFee: 0 }) }));
vi.mock("@/lib/db/rider-quality", () => ({
  getScorecards: async (db: { who: string }) => {
    state.who.push(db.who);
    return state.cards;
  },
  readAutoSuspend: async () => state.auto,
  writeAutoSuspend: async (db: { who: string }, v: boolean) => {
    state.who.push(db.who);
    state.written.push(v);
    return v;
  },
}));

import { GET, PATCH } from "../admin/riders/scorecards/route";
import { normalizeScorecards } from "@/lib/rider-quality";

const patch = (body: unknown) => PATCH(new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) }));

beforeEach(() => {
  state.cards = normalizeScorecards([
    { id: "good", name: "Good", delivered: 20, offered: 20 },
    { id: "bad", name: "Bad", delivered: 5, failed: 5, offered: 10 },
  ]);
  state.auto = false;
  state.who = [];
  state.written = [];
});

describe("/api/admin/riders/scorecards", () => {
  it("GET ranks worst first on the staff client and reports the switch + rules", async () => {
    const body = await (await GET(new Request("http://localhost/x"))).json();
    expect(body.ready).toBe(true);
    expect(body.riders.map((r: { card: { id: string } }) => r.card.id)).toEqual(["bad", "good"]);
    expect(body.autoSuspend).toBe(false);
    expect(body.rules.codOverdueHours).toBe(96);
    expect(state.who).toEqual(["staff-db"]);
  });

  it("GET says ready:false until the migration has run", async () => {
    state.cards = null;
    const body = await (await GET(new Request("http://localhost/x"))).json();
    expect(body).toMatchObject({ ready: false, riders: [] });
  });

  it("PATCH flips the switch on the staff client; refuses anything but a boolean", async () => {
    expect((await patch({ autoSuspend: true })).status).toBe(200);
    expect(state.written).toEqual([true]);
    expect(state.who).toEqual(["staff-db"]);
    expect((await patch({ autoSuspend: "yes" })).status).toBe(422);
    expect((await patch({})).status).toBe(422);
    expect(state.written).toEqual([true]);
  });
});
