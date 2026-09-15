import { describe, expect, it } from "vitest";
import {
  dhakaHour,
  dhakaWeekday,
  hourLabel,
  hourProfile,
  unitsByProduct,
  weekdayProfile,
  zoneDemand,
} from "../insights";
import type { Order } from "../orders";

/* A tiny order factory — only the fields the analytics read. */
type Fix = Partial<Record<string, unknown>>;
const order = (over: Fix = {}): Order => {
  const o = {
    status: "delivered",
    createdAt: Date.UTC(2026, 3, 17, 6, 0), // Fri 2026-04-17 12:00 Asia/Dhaka
    zoneId: "z1",
    zoneName: "Zone A — Sunamganj City",
    subtotal: 100_00,
    items: [{ productId: "p1", name: "Panjabi", qty: 1, unitPrice: 100_00 }],
    ...over,
  };
  return o as unknown as Order;
};

describe("Dhaka clocks — buckets never drift with the viewer", () => {
  it("hours and weekdays are computed on the Bangladesh clock", () => {
    const midnightDhaka = Date.UTC(2026, 3, 17, 18, 0); // 00:00 +06 on Fri→ actually early Sat
    expect(dhakaHour(midnightDhaka)).toBe(0);
    // Friday 12:00 Asia/Dhaka = Friday 06:00 UTC
    expect(dhakaWeekday(Date.UTC(2026, 3, 17, 6, 0))).toBe(5); // Friday
    expect(dhakaHour(Date.UTC(2026, 3, 17, 6, 0))).toBe(12);
    // 23:30 Dhaka on Friday is still Friday there, Saturday in UTC
    expect(dhakaWeekday(Date.UTC(2026, 3, 17, 17, 30))).toBe(5);
  });

  it("labels hours the way a shop owner says them", () => {
    expect(hourLabel(0)).toBe("12AM");
    expect(hourLabel(12)).toBe("noon");
    expect(hourLabel(19)).toBe("7PM");
    expect(hourLabel(9)).toBe("9AM");
  });
});

describe("weekday / hour profiles", () => {
  it("ignores cancelled orders entirely", () => {
    const orders = [order(), order({ status: "cancelled" })];
    expect(weekdayProfile(orders).orders[5]).toBe(1);
    expect(hourProfile(orders).best?.orders).toBe(1);
  });

  it("finds the busiest weekday and the top hours", () => {
    const orders = [
      order({ createdAt: Date.UTC(2026, 3, 17, 6, 0) }), // Fri 12
      order({ createdAt: Date.UTC(2026, 3, 17, 13, 0) }), // Fri 19 — 7PM
      order({ createdAt: Date.UTC(2026, 3, 17, 13, 30) }), // Fri 19:30
      order({ createdAt: Date.UTC(2026, 3, 15, 4, 0) }), // Wed 10
    ];
    const wp = weekdayProfile(orders);
    expect(wp.busiest).toBe(5); // Friday wins 3–1
    expect(wp.units.reduce((a, b) => a + b, 0)).toBe(4);
    const hp = hourProfile(orders);
    expect(hp.best?.hour).toBe(19);
    expect(hp.top[1]?.hour).toBe(10);
  });

  it("is null-honest on an empty list — no invented peak", () => {
    expect(weekdayProfile([]).busiest).toBeNull();
    expect(hourProfile([]).best).toBeNull();
  });
});

describe("unitsByProduct + zoneDemand", () => {
  it("ranks by real units with revenue", () => {
    const orders = [
      order({
        items: [
          { productId: "p1", name: "Panjabi", qty: 2, unitPrice: 149_00 },
          { productId: "p2", name: "Gamcha", qty: 1, unitPrice: 9_90 },
        ],
      }),
      order({ items: [{ productId: "p2", name: "Gamcha", qty: 3, unitPrice: 9_90 }] }),
    ];
    const rows = unitsByProduct(orders);
    expect(rows.map((r) => [r.productId, r.units])).toEqual([
      ["p2", 4],
      ["p1", 2],
    ]);
    expect(rows[0].revenue).toBe(4 * 9_90);
  });

  it("shows per-zone demand with share, busiest day and top picks", () => {
    const orders = [
      order({ zoneId: "z1", zoneName: "City" }),
      order({ zoneId: "z1", zoneName: "City", items: [{ productId: "p9", name: "Lungi", qty: 5, unitPrice: 10_00 }] }),
      order({ zoneId: "z2", zoneName: "Rural", status: "pending" }),
      order({ zoneId: "z2", zoneName: "Rural", status: "cancelled" }), // never counts
    ];
    const rows = zoneDemand(orders);
    expect(rows.map((r) => r.zoneName)).toEqual(["City", "Rural"]); // orders desc
    expect(rows[0].orders).toBe(2);
    expect(rows[0].units).toBe(6);
    expect(rows[1].orders).toBe(1);
    expect(rows[0].share + rows[1].share).toBeCloseTo(1);
    expect(rows[1].share).toBe(1 / 3);
    expect(rows[0].topProducts[0].name).toBe("Lungi");
    expect(rows[0].busiest).toBe(5); // all Fridays here
  });

  it("zero orders → zero share, no divide crash", () => {
    expect(zoneDemand([order({ status: "cancelled" })])).toEqual([]);
  });
});
