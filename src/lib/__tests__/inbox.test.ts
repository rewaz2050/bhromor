import { describe, expect, it } from "vitest";
import {
  applyInboxFilter,
  groupByDay,
  inboxCounts,
  inboxHref,
  type Notif,
} from "../notification-store";

const NOW = new Date(2026, 8, 18, 15, 0).getTime(); // local 15:00
const at = (hoursAgo: number) => NOW - hoursAgo * 3_600_000;

const n = (over: Partial<Notif>): Notif => ({
  id: Math.random().toString(36).slice(2),
  kind: "order",
  title: "t",
  body: "b",
  at: NOW,
  read: false,
  ...over,
});

describe("inboxCounts / applyInboxFilter", () => {
  const list = [
    n({ kind: "order", read: false }),
    n({ kind: "order", read: true }),
    n({ kind: "review", read: false }),
    n({ kind: "stock", read: true }),
    n({ kind: "system", read: true }),
  ];

  it("counts per kind plus all and unread", () => {
    expect(inboxCounts(list)).toEqual({ all: 5, unread: 2, order: 2, review: 1, stock: 1, system: 1 });
  });

  it("filters by kind or by unread", () => {
    expect(applyInboxFilter(list, "all")).toHaveLength(5);
    expect(applyInboxFilter(list, "unread").every((x) => !x.read)).toBe(true);
    expect(applyInboxFilter(list, "unread")).toHaveLength(2);
    expect(applyInboxFilter(list, "review")).toHaveLength(1);
  });
});

describe("groupByDay", () => {
  it("splits newest-first into Today / Yesterday / Earlier, dropping empty groups", () => {
    const list = [
      n({ id: "old", at: at(72) }),
      n({ id: "y", at: at(20) }), // 19:00 yesterday
      n({ id: "t1", at: at(1) }),
      n({ id: "t2", at: at(0.1) }),
    ];
    const groups = groupByDay(list, NOW);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Earlier"]);
    expect(groups[0].items.map((x) => x.id)).toEqual(["t2", "t1"]);
    expect(groups[1].items.map((x) => x.id)).toEqual(["y"]);
    expect(groups[2].items.map((x) => x.id)).toEqual(["old"]);
    expect(groupByDay([n({ at: at(0.5) })], NOW).map((g) => g.label)).toEqual(["Today"]);
    expect(groupByDay([], NOW)).toEqual([]);
  });
});

describe("inboxHref", () => {
  it("passes ordinary links through", () => {
    expect(inboxHref({ href: "/admin/reviews", title: "x", body: "" })).toBe("/admin/reviews");
    expect(inboxHref({ href: "/admin/orders/PS-20260918-0007", title: "x", body: "" })).toBe(
      "/admin/orders/PS-20260918-0007",
    );
    expect(inboxHref({ href: undefined, title: "x", body: "" })).toBeUndefined();
  });

  it("repairs a legacy uuid order link from the order number in the title or body", () => {
    const uuid = "/admin/orders/0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b";
    expect(inboxHref({ href: uuid, title: "Customer cancelled PS-20260918-0042", body: "" })).toBe(
      "/admin/orders/PS-20260918-0042",
    );
    expect(inboxHref({ href: uuid, title: "Cancelled", body: "See PS-20260917-0001 please" })).toBe(
      "/admin/orders/PS-20260917-0001",
    );
    // No order number anywhere → the queue, never a 404.
    expect(inboxHref({ href: uuid, title: "Cancelled", body: "" })).toBe("/admin/orders");
  });
});
