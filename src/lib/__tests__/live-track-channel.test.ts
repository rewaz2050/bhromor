/**
 * The live-tracking channel name is the ONLY thing standing between a
 * stranger and someone's rider moving across a map: the order number is
 * guessable, and a Supabase broadcast channel is readable by anyone who knows
 * its name. These tests pin that the name is (a) unguessable without the
 * phone, (b) identical from the two places that derive it — the customer's
 * tracker read and the rider's job feed — however the phone was typed.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { liveTrackChannel } from "../live-track-channel";

const ORDER = "PS-20261008-0042";
const PHONE = "01711111111";

describe("liveTrackChannel", () => {
  it("derives a stable, prefixed name from the order number and the phone", () => {
    const a = liveTrackChannel(ORDER, PHONE);
    expect(a).toMatch(/^track:[0-9a-f]{24}$/);
    expect(liveTrackChannel(ORDER, PHONE)).toBe(a);
  });

  it("is the same however the phone was typed or the order cased", () => {
    const canonical = liveTrackChannel(ORDER, PHONE);
    expect(liveTrackChannel(ORDER.toLowerCase(), PHONE)).toBe(canonical);
    expect(liveTrackChannel(` ${ORDER} `, PHONE)).toBe(canonical);
    expect(liveTrackChannel(ORDER, "+8801711111111")).toBe(canonical);
    expect(liveTrackChannel(ORDER, "8801711111111")).toBe(canonical);
    expect(liveTrackChannel(ORDER, "017-1111-1111")).toBe(canonical);
  });

  it("is a different name for a different phone — the order id alone is not enough", () => {
    expect(liveTrackChannel(ORDER, "01711111112")).not.toBe(liveTrackChannel(ORDER, PHONE));
  });

  it("is a different name for a different order", () => {
    expect(liveTrackChannel("PS-20261008-0043", PHONE)).not.toBe(liveTrackChannel(ORDER, PHONE));
  });

  it.each([
    ["no order", null, PHONE],
    ["blank order", "   ", PHONE],
    ["no phone", ORDER, null],
    ["blank phone", ORDER, "   "],
  ])("is null with %s — no channel, the tracker just polls", (_label, id, phone) => {
    expect(liveTrackChannel(id, phone)).toBeNull();
  });

  it("carries enough bits that a guessed order number cannot find it", () => {
    // 24 hex chars = 96 bits; two different phones must not collide here.
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      seen.add(liveTrackChannel(ORDER, `017${String(10000000 + i)}`)!);
    }
    expect(seen.size).toBe(500);
  });
});
