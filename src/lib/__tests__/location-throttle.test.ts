import { describe, expect, it } from "vitest";
import { fixDistanceM, HEARTBEAT_MS, MIN_MOVE_M, shouldSendFix } from "../location-throttle";

describe("location throttle", () => {
  it("always sends the first fix", () => {
    expect(shouldSendFix(null, 23.81, 90.41, 1_000)).toBe(true);
  });

  it("skips a same-spot fix inside the heartbeat window", () => {
    const last = { lat: 23.81, lng: 90.41, at: 1_000 };
    expect(shouldSendFix(last, 23.81, 90.41, 1_000 + 30_000)).toBe(false);
  });

  it("sends once the rider moved 50 m", () => {
    const last = { lat: 23.81, lng: 90.41, at: 1_000 };
    // ~0.0005° latitude ≈ 55 m.
    expect(shouldSendFix(last, 23.8105, 90.41, 1_000 + 30_000)).toBe(true);
    expect(fixDistanceM(23.81, 90.41, 23.8105, 90.41)).toBeGreaterThan(MIN_MOVE_M);
  });

  it("sends the heartbeat even when standing still", () => {
    const last = { lat: 23.81, lng: 90.41, at: 1_000 };
    expect(shouldSendFix(last, 23.81, 90.41, 1_000 + HEARTBEAT_MS)).toBe(true);
  });
});
