import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  fixAgeLabel,
  fixAgeMin,
  riderMarkerHtml,
  riderMarkerStyle,
  riderPopupHtml,
  STALE_FIX_MIN,
} from "../rider-map-marker";

const NOW = Date.parse("2026-10-02T06:00:00Z");
const MIN = 60_000;
const rider = (over = {}) => ({ name: "Karim", phone: "017", zoneIds: ["z1", "z2"], isOnline: true, currentLoad: 0, lastLocationAt: NOW - MIN, ...over });

describe("fix age", () => {
  it("whole minutes, never negative, null when unknown", () => {
    expect(fixAgeMin(NOW - 90_000, NOW)).toBe(1);
    expect(fixAgeMin(NOW + 5 * MIN, NOW)).toBe(0);
    expect(fixAgeMin(undefined, NOW)).toBeNull();
    expect(fixAgeMin(Number.NaN, NOW)).toBeNull();
  });
  it("reads naturally", () => {
    expect(fixAgeLabel(null)).toMatch(/no fix time/);
    expect(fixAgeLabel(0)).toBe("just now");
    expect(fixAgeLabel(12)).toBe("12 min ago");
    expect(fixAgeLabel(120)).toBe("2 h ago");
    expect(fixAgeLabel(60 * 48)).toBe("2 d ago");
  });
});

describe("riderMarkerStyle", () => {
  it("an online rider with a fresh fix is live (green idle / amber loaded)", () => {
    expect(riderMarkerStyle(rider(), NOW)).toMatchObject({ stale: false, color: "#22c55e" });
    expect(riderMarkerStyle(rider({ currentLoad: 1 }), NOW)).toMatchObject({ stale: false, color: "#f59e0b" });
  });
  it(`an online rider's fix becomes stale at ${STALE_FIX_MIN} minutes, keeping its colour`, () => {
    expect(riderMarkerStyle(rider({ lastLocationAt: NOW - (STALE_FIX_MIN - 1) * MIN }), NOW).stale).toBe(false);
    expect(riderMarkerStyle(rider({ lastLocationAt: NOW - STALE_FIX_MIN * MIN }), NOW)).toMatchObject({ stale: true, color: "#22c55e" });
  });
  it("offline riders are grey and never 'stale' (they are not claiming to be live); unknown age is not flagged", () => {
    expect(riderMarkerStyle(rider({ isOnline: false, lastLocationAt: NOW - 90 * MIN }), NOW)).toMatchObject({ stale: false, color: "#6b7280" });
    expect(riderMarkerStyle(rider({ lastLocationAt: undefined }), NOW).stale).toBe(false);
  });
});

describe("markup", () => {
  it("escapes everything a rider or customer typed", () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).not.toMatch(/[<>"']/);
    const style = riderMarkerStyle(rider(), NOW);
    expect(riderPopupHtml(rider({ name: "<script>x</script>", phone: '"><b>' }), style)).not.toContain("<script>");
    expect(riderMarkerHtml("<b>", style)).not.toContain("<b>");
    expect(riderMarkerHtml("  ", style)).toContain("?");
  });
  it("a stale pin is hollow with a badge and a warning popup; a live pin is solid", () => {
    const stale = riderMarkerStyle(rider({ lastLocationAt: NOW - 20 * MIN }), NOW);
    expect(riderMarkerHtml("Karim", stale)).toContain("dashed");
    expect(riderMarkerHtml("Karim", stale)).toContain(">?<");
    expect(riderPopupHtml(rider(), stale)).toMatch(/20 min ago — may not be where they are now/);
    const live = riderMarkerStyle(rider(), NOW);
    expect(riderMarkerHtml("Karim", live)).not.toContain("dashed");
    expect(riderPopupHtml(rider(), live)).toContain("Last location 1 min ago");
  });
});
