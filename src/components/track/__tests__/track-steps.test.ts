/**
 * Track page timeline — four public milestones (two-tap flow, 2026-09-17).
 *
 * The customer used to see six steps ("Preparing", "Courier Assigned", "Out
 * for Delivery" …) that mirrored the database. Now: Order placed →
 * Confirmed → Picked up → Delivered, and "Picked up" only ticks once the
 * rider actually has the parcel.
 */
import { describe, expect, it } from "vitest";
import { PUBLIC_STEPS, type Order, type OrderStatus } from "@/lib/orders";
import { currentStepIndex, stepReached, stepTime } from "../track-view";

const T0 = Date.UTC(2026, 8, 17, 4, 0, 0);
const order = (status: OrderStatus, reached: OrderStatus[]): Order =>
  ({
    id: "PS-1",
    createdAt: T0,
    customer: { name: "Rahat", phone: "01712345678", area: "Sadar" },
    zoneId: "z1",
    zoneName: "Zone",
    etaLabel: "45 min",
    items: [],
    subtotal: 0,
    deliveryCharge: 0,
    total: 0,
    payment: "cod",
    status,
    timeline: reached.map((s, i) => ({ status: s, at: T0 + i * 60_000 })),
  }) as Order;

describe("track-view public steps", () => {
  it("renders exactly four milestones", () => {
    expect(PUBLIC_STEPS).toHaveLength(4);
  });

  it("puts each internal status on the right milestone", () => {
    expect(currentStepIndex(order("pending", ["pending"]))).toBe(0);
    expect(currentStepIndex(order("confirmed", ["pending", "confirmed"]))).toBe(1);
    expect(currentStepIndex(order("preparing", ["pending", "confirmed", "preparing"]))).toBe(1);
    expect(currentStepIndex(order("ready-for-pickup", []))).toBe(2);
    expect(currentStepIndex(order("courier-assigned", []))).toBe(2);
    expect(currentStepIndex(order("out-for-delivery", []))).toBe(2);
    expect(currentStepIndex(order("delivered", []))).toBe(3);
    expect(currentStepIndex(order("cancelled", []))).toBe(-1);
  });

  it("ticks 'Picked up' only once the rider has the parcel", () => {
    const waiting = order("ready-for-pickup", ["pending", "confirmed", "ready-for-pickup"]);
    expect(stepReached(waiting, 0)).toBe(true);
    expect(stepReached(waiting, 1)).toBe(true);
    expect(stepReached(waiting, 2)).toBe(false);
    expect(stepReached(waiting, 3)).toBe(false);

    const moving = order("out-for-delivery", [
      "pending",
      "confirmed",
      "ready-for-pickup",
      "courier-assigned",
      "out-for-delivery",
    ]);
    expect(stepReached(moving, 2)).toBe(true);
    expect(stepReached(moving, 3)).toBe(false);
  });

  it("a cancelled order has no ticks at all", () => {
    const c = order("cancelled", ["pending", "confirmed", "cancelled"]);
    for (let i = 0; i < 4; i++) expect(stepReached(c, i)).toBe(false);
  });

  it("shows the time the milestone happened — and the packing time while the rider is still coming", () => {
    const moving = order("out-for-delivery", [
      "pending",
      "confirmed",
      "ready-for-pickup",
      "courier-assigned",
      "out-for-delivery",
    ]);
    // done → the doneAt entry (out-for-delivery, 4 min after T0)
    const pickedAt = new Date(T0 + 4 * 60_000);
    expect(stepTime(moving, 2)).toBe(
      pickedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    );
    // in progress → earliest state inside the milestone (ready-for-pickup, +2 min)
    const waiting = order("courier-assigned", [
      "pending",
      "confirmed",
      "ready-for-pickup",
      "courier-assigned",
    ]);
    const readyAt = new Date(T0 + 2 * 60_000);
    expect(stepTime(waiting, 2)).toBe(
      readyAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
    );
    expect(stepTime(waiting, 3)).toBeUndefined();
  });
});
