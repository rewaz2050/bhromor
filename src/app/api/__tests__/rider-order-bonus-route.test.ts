import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({ rolesAsked: [] as unknown[], wrote: [] as { who: unknown; raw: unknown }[] }));

vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class extends Error {},
  requireStaff: async () => ({ user: { id: "s1" }, role: "admin", db: { who: "staff-db" } }),
  requireStaffRole: async (...roles: unknown[]) => {
    state.rolesAsked.push(roles);
    return { user: { id: "s1" }, role: "admin", db: { who: "staff-db" } };
  },
}));
vi.mock("@/lib/db/rider-order-bonus", async () => {
  const { AdminInputError } = await import("@/lib/db/admin");
  const { ORDER_BONUS_DEFAULTS } = await import("@/lib/rider-order-bonus");
  return {
    readOrderBonusSettings: async () => ORDER_BONUS_DEFAULTS,
    writeOrderBonusSettings: async (db: unknown, raw: Record<string, unknown>) => {
      if (raw.peakBonusTaka === 999) throw new AdminInputError("Too much.", 422);
      state.wrote.push({ who: db, raw });
      return { ...ORDER_BONUS_DEFAULTS, peakBonus: 3000 };
    },
  };
});

import { GET, PATCH } from "../admin/riders/order-bonus/route";

const req = (body?: unknown) =>
  new Request("http://localhost/x", { method: body ? "PATCH" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

beforeEach(() => {
  state.rolesAsked = [];
  state.wrote = [];
});

describe("/api/admin/riders/order-bonus", () => {
  it("GET returns the settings (all off by default)", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(((await res.json()) as { settings: { peakBonus: number; rainBonus: number } }).settings).toMatchObject({ peakBonus: 0, rainBonus: 0 });
  });
  it("PATCH writes on the STAFF client, restricted to admin roles", async () => {
    const res = await PATCH(req({ peakBonusTaka: 30 }));
    expect(res.status).toBe(200);
    expect(state.wrote[0]).toEqual({ who: { who: "staff-db" }, raw: { peakBonusTaka: 30 } });
    expect(state.rolesAsked.flat().flat()).toEqual(expect.arrayContaining(["admin", "super_admin"]));
  });
  it("PATCH maps a validation error to its status", async () => {
    const res = await PATCH(req({ peakBonusTaka: 999 }));
    expect(res.status).toBe(422);
  });
});
