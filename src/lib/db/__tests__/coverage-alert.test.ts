/** Item S: the owner's bell rings when a freshly-ready order has nobody to take it. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const notices = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("../engagement", () => ({
  notifyStaff: async (_db: unknown, n: Record<string, unknown>) => { notices.push(n); },
}));

import { notifyIfNoCoverage } from "../coverage-alert";

const NOW = Date.now();
const order = (over: Record<string, unknown> = {}) =>
  ({ id: "PS-9", zoneId: "town", zoneName: "Town", status: "ready-for-pickup", createdAt: NOW, timeline: [], ...over }) as never;
const row = (over: Record<string, unknown> = {}) => ({
  id: "r1", name: "Rafiq", phone: "01711111111", vehicle: "bike", zone_ids: ["town"], status: "active", is_online: true,
  cash_in_hand: 0, current_load: 0, rating_avg: 0, rating_count: 0, ...over,
});
const service = (riders: unknown[] | null, settings: unknown[] = []) =>
  ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "in", "limit"]) chain[m] = () => chain;
      chain.then = (ok: (v: unknown) => unknown) =>
        Promise.resolve(
          table === "riders"
            ? riders ? { data: riders, error: null } : { data: null, error: { message: "boom" } }
            : { data: settings, error: null },
        ).then(ok);
      return chain;
    },
  }) as never;

beforeEach(() => { notices.length = 0; });

describe("notifyIfNoCoverage", () => {
  it("rings the staff bell, naming the order, the reason and the fix, when no rider covers the zone", async () => {
    expect(await notifyIfNoCoverage(service([row({ zone_ids: ["other"] })]), order())).toBe(true);
    expect(notices[0]).toMatchObject({ kind: "order", href: "/admin/deliveries" });
    expect(String(notices[0].title)).toContain("PS-9");
    expect(String(notices[0].body)).toContain("No active rider covers Town");
  });

  it("is silent when an eligible rider exists", async () => {
    expect(await notifyIfNoCoverage(service([row()]), order())).toBe(false);
    expect(notices).toHaveLength(0);
  });

  it("uses the admin-set cash cap (a rider at ৳3,000 is blocked once the cap is ৳2,000)", async () => {
    const r = [row({ cash_in_hand: 300000 })];
    expect(await notifyIfNoCoverage(service(r), order())).toBe(false);
    expect(await notifyIfNoCoverage(service(r, [{ key: "rider_cash_cap_paisa", value: 200000 }]), order())).toBe(true);
  });

  it("never alerts for counter pickups, and never throws on a failed read", async () => {
    expect(await notifyIfNoCoverage(service([]), order({ isPickup: true }))).toBe(false);
    expect(await notifyIfNoCoverage(service(null), order())).toBe(false);
    expect(await notifyIfNoCoverage({ from: () => { throw new Error("down"); } } as never, order())).toBe(false);
    expect(notices).toHaveLength(0);
  });
});
