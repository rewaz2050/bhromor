import { describe, expect, it } from "vitest";
import { groupHistoryByDay, historyDayLabel, parseHistoryCursor, type RiderHistoryItem } from "../rider-history";

const item = (over: Partial<RiderHistoryItem>): RiderHistoryItem => ({
  id: "a", orderNo: "PS-1", outcome: "delivered", at: Date.parse("2026-10-01T10:00:00+06:00"),
  cursor: "2026-10-01T04:00:00.000Z", shopName: "Shop", area: "Area", isReturn: false, payment: "cod", cash: 0, earned: 0, ...over,
});

describe("rider history helpers (Phase C)", () => {
  it("accepts only ISO-parsable cursors", () => {
    expect(parseHistoryCursor("2026-10-01T04:00:00Z")).toBe("2026-10-01T04:00:00.000Z");
    expect(parseHistoryCursor("'; drop table")).toBeNull();
    expect(parseHistoryCursor(null)).toBeNull();
  });

  it("groups by Dhaka day — 23:30 and 00:30 Dhaka land on different days", () => {
    const late = item({ id: "late", at: Date.parse("2026-10-01T23:30:00+06:00"), earned: 4000, cash: 50000 });
    const early = item({ id: "early", at: Date.parse("2026-10-02T00:30:00+06:00"), earned: 4000 });
    const days = groupHistoryByDay([early, late]);
    expect(days.map((d) => d.day)).toEqual(["2026-10-02", "2026-10-01"]);
    expect(days[1].cash).toBe(50000);
  });

  it("totals deliveries, failures and earnings per day", () => {
    const days = groupHistoryByDay([
      item({ id: "1", earned: 4000, cash: 10000 }),
      item({ id: "2", earned: 5000 }),
      item({ id: "3", outcome: "failed", earned: 0 }),
    ]);
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ delivered: 2, failed: 1, earned: 9000, cash: 10000 });
  });

  it("labels today and yesterday in words", () => {
    const now = Date.parse("2026-10-01T12:00:00+06:00");
    expect(historyDayLabel("2026-10-01", now)).toBe("আজ");
    expect(historyDayLabel("2026-09-30", now)).toBe("গতকাল");
    expect(historyDayLabel("2026-09-12", now)).not.toBe("আজ");
  });
});
