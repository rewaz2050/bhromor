import { describe, expect, it } from "vitest";
import { CASH_WARN_PAISA, cashMeter, countActiveTrips, offeredIds, secondsLeft, toRiderTasks } from "../rider-tasks";
import type { RiderJob } from "../db/riders";

const job = (id: string, state: RiderJob["state"]): RiderJob =>
  ({ id, orderId: `o-${id}`, state, offeredAt: 0, expiresAt: 5000, order: { id: `PS-${id}` }, pickupShop: undefined }) as unknown as RiderJob;

describe("toRiderTasks", () => {
  it("keeps offered / accepted / picked_up work and drops closed jobs", () => {
    const tasks = toRiderTasks([
      job("1", "offered"), job("2", "accepted"), job("3", "picked_up"),
      job("4", "delivered"), job("5", "cancelled"), job("6", "expired"), job("7", "failed"),
    ]);
    expect(tasks.map((t) => [t.id, t.state])).toEqual([["1", "offered"], ["2", "accepted"], ["3", "picked_up"]]);
  });
  it("a final failed attempt is closed — the rider only returns the parcel", () => {
    expect(toRiderTasks([job("9", "failed")])).toEqual([]);
  });
  it("carries the offer expiry and the pickup shop through", () => {
    const j = { ...job("1", "offered"), pickupShop: { name: "Shop" } } as unknown as RiderJob;
    expect(toRiderTasks([j])[0]).toMatchObject({ expiresAt: 5000, pickupShop: { name: "Shop" } });
  });
});

describe("counts", () => {
  const tasks = toRiderTasks([job("1", "offered"), job("2", "offered"), job("3", "accepted"), job("4", "picked_up")]);
  it("an offer is not a trip", () => expect(countActiveTrips(tasks)).toBe(2));
  it("offeredIds lists only the offers, in order", () => expect(offeredIds(tasks)).toEqual(["1", "2"]));
});

describe("secondsLeft", () => {
  it("rounds up, never negative", () => {
    expect(secondsLeft(10_000, 8_500)).toBe(2);
    expect(secondsLeft(10_000, 10_000)).toBe(0);
    expect(secondsLeft(10_000, 99_000)).toBe(0);
  });
});

describe("cashMeter", () => {
  it("is green below the warning band, amber above it, red at the cap", () => {
    expect(cashMeter(100000, 500000)).toEqual({ reached: false, percent: 20, tone: "emerald" });
    expect(cashMeter(CASH_WARN_PAISA, 500000).tone).toBe("emerald");
    expect(cashMeter(CASH_WARN_PAISA + 1, 500000).tone).toBe("amber");
    expect(cashMeter(500000, 500000)).toMatchObject({ reached: true, tone: "rose", percent: 100 });
  });
  it("a lowered admin cap is honoured and the bar never overflows", () => {
    expect(cashMeter(250000, 200000)).toMatchObject({ reached: true, percent: 100 });
    expect(cashMeter(0, 200000)).toMatchObject({ reached: false, percent: 0 });
  });
});
