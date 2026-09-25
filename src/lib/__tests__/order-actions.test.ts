/**
 * Batch H (2026-09-18): the one next tap per order, shared by the admin
 * list rows, the admin detail page and the vendor queue.
 */
import { describe, expect, it } from "vitest";
import {
  ageLabel,
  ageMinutes,
  canQuickCancel,
  oldestOf,
  PICKUP_HANDOVER_LABEL,
  primaryAction,
} from "../order-actions";
import type { Order, OrderStatus } from "../orders";

const o = (over: Partial<Order>): Order =>
  ({
    id: "PS-20260918-0001",
    status: "pending",
    payment: "cod",
    paymentStatus: "verified",
    ...over,
  }) as Order;

describe("primaryAction", () => {
  it("pending → Confirm for staff and vendor alike", () => {
    expect(primaryAction(o({ status: "pending" }), "staff")).toMatchObject({ kind: "action", to: "confirmed" });
    expect(primaryAction(o({ status: "pending" }), "vendor")).toMatchObject({ kind: "action", to: "confirmed" });
  });

  it("confirmed / preparing → Ready — request riders (two-tap flow)", () => {
    for (const status of ["confirmed", "preparing"] as OrderStatus[]) {
      expect(primaryAction(o({ status }))).toMatchObject({
        kind: "action",
        to: "ready-for-pickup",
        label: "Ready — request riders",
      });
    }
  });

  it("a counter pickup says the customer collects, not 'call rider'", () => {
    const a = primaryAction(o({ status: "confirmed", isPickup: true }));
    expect(a).toMatchObject({ kind: "action", to: "ready-for-pickup" });
    expect((a as { label: string }).label).toMatch(/customer can collect/i);
    expect((a as { label: string }).label).not.toMatch(/rider/i);
  });

  it("an unverified wallet payment BLOCKS Ready and points at the verification", () => {
    const staff = primaryAction(
      o({ status: "confirmed", payment: "bkash", paymentStatus: "pending_verification" }),
      "staff",
    );
    expect(staff).toMatchObject({ kind: "blocked", href: "/admin/orders/PS-20260918-0001" });
    expect((staff as { reason: string }).reason).toContain("bKash");
    const vendor = primaryAction(
      o({ status: "preparing", payment: "nagad", paymentStatus: "pending_verification" }),
      "vendor",
    );
    expect(vendor).toMatchObject({ kind: "blocked" });
    expect((vendor as { reason: string }).reason).toContain("Nagad");
  });

  it("does not block Confirm on an unverified wallet order (the database allows it)", () => {
    expect(
      primaryAction(o({ status: "pending", payment: "bkash", paymentStatus: "pending_verification" })),
    ).toMatchObject({ kind: "action", to: "confirmed" });
  });

  it("rider-owned states are a wait for home delivery, with who holds the order", () => {
    expect(primaryAction(o({ status: "ready-for-pickup" }))).toMatchObject({ kind: "wait", reason: "Waiting for a rider" });
    expect(primaryAction(o({ status: "courier-assigned" }))).toMatchObject({ kind: "wait" });
    expect(primaryAction(o({ status: "out-for-delivery" }))).toMatchObject({ kind: "wait" });
  });

  it("a READY counter pickup gives staff 'Handed to customer' (→ delivered) but only a wait to the vendor", () => {
    const staff = primaryAction(o({ status: "ready-for-pickup", isPickup: true }), "staff");
    expect(staff).toMatchObject({ kind: "action", to: "delivered", label: PICKUP_HANDOVER_LABEL });
    expect((staff as { confirm?: string }).confirm).toContain("PS-20260918-0001");
    expect(primaryAction(o({ status: "ready-for-pickup", isPickup: true }), "vendor")).toMatchObject({ kind: "wait" });
  });

  it("return legs never get flow buttons", () => {
    expect(primaryAction(o({ status: "pending", isReturn: true }))).toMatchObject({ kind: "wait" });
    expect(primaryAction(o({ status: "confirmed", isReturn: true }), "vendor")).toMatchObject({ kind: "wait" });
  });

  it("delivered / cancelled → nothing", () => {
    expect(primaryAction(o({ status: "delivered" }))).toBeNull();
    expect(primaryAction(o({ status: "cancelled" }))).toBeNull();
  });
});

describe("canQuickCancel", () => {
  it("mirrors the database: only pending / confirmed / preparing, never a return leg", () => {
    expect(canQuickCancel(o({ status: "pending" }))).toBe(true);
    expect(canQuickCancel(o({ status: "confirmed" }))).toBe(true);
    expect(canQuickCancel(o({ status: "preparing" }))).toBe(true);
    expect(canQuickCancel(o({ status: "ready-for-pickup" }))).toBe(false);
    expect(canQuickCancel(o({ status: "out-for-delivery" }))).toBe(false);
    expect(canQuickCancel(o({ status: "pending", isReturn: true }))).toBe(false);
  });
});

describe("age helpers", () => {
  const now = Date.UTC(2026, 8, 18, 12, 0, 0);
  it("ageMinutes floors and never goes negative", () => {
    expect(ageMinutes(now - 90_000, now)).toBe(1);
    expect(ageMinutes(now + 60_000, now)).toBe(0);
  });
  it("ageLabel reads like a person", () => {
    expect(ageLabel(now - 20_000, now)).toBe("just now");
    expect(ageLabel(now - 7 * 60_000, now)).toBe("7 min");
    expect(ageLabel(now - 72 * 60_000, now)).toBe("1 h 12 min");
    expect(ageLabel(now - 49 * 3_600_000, now)).toBe("2 d");
  });
  it("oldestOf picks the earliest createdAt among the given statuses", () => {
    const rows = [
      { status: "pending" as OrderStatus, createdAt: now - 5 * 60_000 },
      { status: "confirmed" as OrderStatus, createdAt: now - 40 * 60_000 },
      { status: "delivered" as OrderStatus, createdAt: now - 400 * 60_000 },
    ];
    expect(oldestOf(rows, ["pending", "confirmed"])).toBe(now - 40 * 60_000);
    expect(oldestOf(rows, ["out-for-delivery"])).toBeNull();
  });
});
