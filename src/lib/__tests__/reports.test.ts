import { describe, expect, it } from "vitest";
import {
  dayKey,
  dayLabel,
  salesReport,
  seriesCsv,
  seriesMax,
  startOfDay,
} from "../reports";
import { makePlacedOrder, type Order } from "../orders";
import { bdt } from "../format";

/** Deterministic order factory for report math (paisa everywhere). */
const makeOrder = (spec: {
  id: string;
  daysAgo: number;
  total: number; // taka — converted via bdt()
  status?: Order["status"];
  zone?: string;
  coupon?: { code: string; discount: number };
  items?: { productId: string; name: string; qty: number; price: number }[];
  payment?: Order["payment"];
  paymentStatus?: Order["paymentStatus"];
}): Order => {
  const createdAt = startOfDay(Date.now()) - spec.daysAgo * 86_400_000;
  const items = spec.items ?? [
    {
      productId: "p1",
      name: "Panjabi",
      qty: 1,
      price: spec.total,
    },
  ];
  const order = makePlacedOrder({
    id: spec.id,
    createdAt,
    customer: { name: "Buyer", phone: "01700000000", area: "Kandirpar" },
    zone: {
      id: "z1",
      name: spec.zone ?? "Zone A — City Centre",
      etaLabel: "40–50 min",
      charge: bdt(0),
    },
    coupon: spec.coupon,
    items: items.map((it) => ({
      product: {
        id: it.productId,
        slug: "slug",
        sku: "SKU",
        name: it.name,
        price: bdt(it.price),
      },
      image: "",
      variant: "·",
      qty: it.qty,
    })),
  });
  return {
    ...order,
    status: spec.status ?? "delivered",
    payment: spec.payment ?? "cod",
    paymentStatus: spec.paymentStatus ?? "verified",
  };
};

describe("salesReport — wallet collection (P1 #8)", () => {
  it("a verified wallet order counts as collected before delivery", () => {
    const orders = [
      // bKash, verified at checkout, still out for delivery — money is in
      // the shop's wallet, so it is collected already.
      makeOrder({
        id: "PS-W1",
        daysAgo: 0,
        total: 1000,
        status: "out-for-delivery",
        payment: "bkash",
        paymentStatus: "verified",
      }),
    ];
    const r = salesReport(orders, { days: null, label: "All time" });
    expect(r.summary.booked).toBe(bdt(1000));
    expect(r.summary.collected).toBe(bdt(1000));
    expect(r.summary.outstanding).toBe(0);
  });

  it("an unverified wallet order is booked but NOT collected", () => {
    const orders = [
      makeOrder({
        id: "PS-W2",
        daysAgo: 0,
        total: 500,
        status: "confirmed",
        payment: "nagad",
        paymentStatus: "pending_verification",
      }),
    ];
    const r = salesReport(orders, { days: null, label: "All time" });
    expect(r.summary.booked).toBe(bdt(500));
    expect(r.summary.collected).toBe(0);
    expect(r.summary.outstanding).toBe(bdt(500));
  });

  it("COD is unchanged — collected only when delivered", () => {
    const orders = [
      makeOrder({ id: "PS-C1", daysAgo: 0, total: 300, status: "out-for-delivery" }),
      makeOrder({ id: "PS-C2", daysAgo: 0, total: 400 }),
    ];
    const r = salesReport(orders, { days: null, label: "All time" });
    expect(r.summary.collected).toBe(bdt(400));
  });
});

describe("salesReport", () => {
  it("books live orders and collects only delivered ones", () => {
    const orders = [
      makeOrder({ id: "PS-1", daysAgo: 0, total: 1000 }),
      makeOrder({
        id: "PS-2",
        daysAgo: 0,
        total: 500,
        status: "pending",
      }),
      makeOrder({ id: "PS-3", daysAgo: 0, total: 700, status: "cancelled" }),
    ];
    const report = salesReport(orders, { days: 7, label: "7 days" });
    expect(report.summary.orders).toBe(2);
    expect(report.summary.booked).toBe(bdt(1500));
    expect(report.summary.collected).toBe(bdt(1000));
    expect(report.summary.outstanding).toBe(bdt(500));
    expect(report.summary.cancelled).toBe(1);
    expect(report.summary.cancelledPct).toBe(33);
  });

  it("zero-fills calendar days inside the window", () => {
    const orders = [
      makeOrder({ id: "PS-1", daysAgo: 0, total: 100 }),
      makeOrder({ id: "PS-2", daysAgo: 5, total: 200 }),
    ];
    const report = salesReport(orders, { days: 7, label: "7 days" });
    // series runs oldest → newest; today is the last bucket
    expect(report.series).toHaveLength(7);
    expect(report.series[6].orderCount).toBe(1); // today
    expect(report.series[1].orderCount).toBe(1); // 5 days ago
    expect(report.series[0].orderCount).toBe(0);
    expect(report.series[6].key).toBe(dayKey(Date.now()));
  });

  it("excludes orders outside the window", () => {
    const orders = [
      makeOrder({ id: "PS-1", daysAgo: 0, total: 100 }),
      makeOrder({ id: "PS-2", daysAgo: 12, total: 200 }),
    ];
    const report = salesReport(orders, { days: 7, label: "7 days" });
    expect(report.summary.orders).toBe(1);
    expect(report.summary.booked).toBe(bdt(100));
    const all = salesReport(orders, { days: null, label: "All time" });
    expect(all.summary.orders).toBe(2);
  });

  it("caps all-time at 120 daily buckets", () => {
    const report = salesReport([], { days: null, label: "All time" });
    expect(report.series.length).toBeLessThanOrEqual(120);
  });

  it("aggregates top products by snapshot name, qty and revenue", () => {
    const orders = [
      makeOrder({
        id: "PS-1",
        daysAgo: 0,
        total: 0,
        items: [
          { productId: "p-a", name: "Panjabi", qty: 2, price: 900 },
          { productId: "p-b", name: "Kurta", qty: 1, price: 700 },
        ],
      }),
      makeOrder({
        id: "PS-2",
        daysAgo: 1,
        total: 0,
        items: [{ productId: "p-a", name: "Panjabi", qty: 1, price: 900 }],
      }),
    ];
    const report = salesReport(orders, { days: 7, label: "7 days" });
    expect(report.topProducts).toHaveLength(2);
    expect(report.topProducts[0]).toMatchObject({
      productId: "p-a",
      name: "Panjabi",
      units: 3,
      orders: 2,
    });
    expect(report.topProducts[0].revenue).toBe(bdt(2700));
  });

  it("groups zones and coupon usage with discount sums", () => {
    const orders = [
      makeOrder({
        id: "PS-1",
        daysAgo: 0,
        total: 800,
        zone: "Zone B — Inner Ring",
        coupon: { code: "EID50", discount: bdt(150) },
      }),
      makeOrder({
        id: "PS-2",
        daysAgo: 0,
        total: 600,
        coupon: { code: "EID50", discount: bdt(60) },
      }),
      makeOrder({
        id: "PS-3",
        daysAgo: 0,
        total: 400,
        zone: "Zone B — Inner Ring",
      }),
    ];
    const report = salesReport(orders, { days: 7, label: "7 days" });
    expect(report.zones).toHaveLength(2);
    const zoneB = report.zones.find((z) => z.zoneName.includes("Inner Ring"));
    expect(zoneB).toMatchObject({ orders: 2 });
    expect(report.coupons).toEqual([
      { code: "EID50", orders: 2, discount: bdt(210) },
    ]);
    expect(report.summary.couponDiscount).toBe(bdt(210));
    // order totals are net of the coupon discount (§56)
    expect(report.summary.booked).toBe(bdt(1590));
    expect(report.summary.booked + report.summary.couponDiscount).toBe(
      bdt(1800),
    );
  });

  it("exposes per-day revenue used for chart scaling", () => {
    const orders = [
      makeOrder({ id: "PS-1", daysAgo: 0, total: 400 }),
      makeOrder({ id: "PS-2", daysAgo: 1, total: 900 }),
    ];
    const report = salesReport(orders, { days: 7, label: "7 days" });
    expect(seriesMax(report.series)).toBe(bdt(900));
    expect(report.series[5].revenue).toBe(bdt(900)); // yesterday
    expect(report.series[6].revenue).toBe(bdt(400)); // today
    expect(dayLabel(Date.now())).toMatch(/^\d{1,2} [A-Z]\w+$/);
  });
});

describe("salesReport — payment mix (ops batch I)", () => {
  const orders = [
    // Cash: one delivered (collected), one still on the road (booked only).
    makeOrder({ id: "c1", daysAgo: 0, total: 1000, payment: "cod", status: "delivered" }),
    makeOrder({ id: "c2", daysAgo: 0, total: 500, payment: "cod", status: "out-for-delivery" }),
    // bKash: one verified (collected even before delivery), one awaiting.
    makeOrder({ id: "b1", daysAgo: 1, total: 700, payment: "bkash", status: "confirmed", paymentStatus: "verified" }),
    makeOrder({ id: "b2", daysAgo: 1, total: 300, payment: "bkash", status: "pending", paymentStatus: "pending_verification" }),
    // Cancelled wallet order never counts anywhere.
    makeOrder({ id: "x1", daysAgo: 1, total: 900, payment: "nagad", status: "cancelled", paymentStatus: "rejected" }),
  ];
  const r = salesReport(orders, { days: 7, label: "7 days" });
  const by = Object.fromEntries(r.payments.map((p) => [p.method, p]));

  it("splits booked vs collected per pocket with the summary's own rule", () => {
    expect(by.cod).toMatchObject({ orders: 2, booked: bdt(1500), collected: bdt(1000), awaiting: 0 });
    expect(by.bkash).toMatchObject({ orders: 2, booked: bdt(1000), collected: bdt(700), awaiting: 1 });
    expect(by.nagad).toMatchObject({ orders: 0, booked: 0, collected: 0, awaiting: 0 });
  });

  it("adds up to the headline numbers", () => {
    const booked = r.payments.reduce((s, p) => s + p.booked, 0);
    const collected = r.payments.reduce((s, p) => s + p.collected, 0);
    expect(booked).toBe(r.summary.booked);
    expect(collected).toBe(r.summary.collected);
  });

  it("exports the daily series in taka with a BOM and CRLF rows", () => {
    const csv = seriesCsv(r);
    expect(csv.startsWith("\uFEFFDay,Orders,Revenue (Tk)\r\n")).toBe(true);
    const today = csv.trim().split("\r\n").pop();
    expect(today).toBe(`${dayKey(startOfDay(Date.now()))},2,1500.00`);
  });
});
