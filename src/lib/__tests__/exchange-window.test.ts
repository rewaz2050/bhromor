import { describe, expect, it } from "vitest";
import {
  EXCHANGE_WINDOW_MS,
  exchangeCountdown,
} from "../exchange-window";

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe("exchangeCountdown", () => {
  it("counts days left, not a closing date", () => {
    const c = exchangeCountdown(NOW - 2 * DAY, NOW, "en")!;
    expect(c.days).toBe(5);
    expect(c.label).toBe("5 days");
    expect(c.closed).toBe(false);
    expect(c.closing).toBe(false);
  });

  it("says days and hours, and does not call that closing yet", () => {
    const c = exchangeCountdown(NOW - (5 * DAY + 5 * 60 * 60_000), NOW, "en")!;
    expect(c.days).toBe(1);
    expect(c.label).toBe("1 day 19 h");
    expect(c.closing).toBe(false);
  });

  it("marks the last day as closing — that is the day people forget", () => {
    const c = exchangeCountdown(NOW - (6 * DAY + 6 * 60 * 60_000), NOW, "en")!;
    expect(c.days).toBe(0);
    expect(c.label).toBe("18 h");
    expect(c.closing).toBe(true);
  });

  it("drops to hours, then minutes, inside the last day", () => {
    expect(exchangeCountdown(NOW - (6 * DAY + 20 * 60 * 60_000), NOW, "en")!.label).toBe(
      "4 h",
    );
    expect(exchangeCountdown(NOW - (7 * DAY - 25 * 60_000), NOW, "en")!.label).toBe(
      "25 min",
    );
  });

  it("writes Bengali in Bengali digits", () => {
    const c = exchangeCountdown(NOW - 4 * DAY, NOW, "bn")!;
    expect(c.label).toBe("৩ দিন");
  });

  it("closes exactly at the window and stays closed after it", () => {
    const delivered = NOW - EXCHANGE_WINDOW_MS;
    expect(exchangeCountdown(delivered, NOW, "en")!.closed).toBe(true);
    expect(exchangeCountdown(delivered - DAY, NOW, "en")!.closed).toBe(true);
  });

  it("has nothing to say without a proven delivery moment", () => {
    expect(exchangeCountdown(null, NOW)).toBeNull();
    expect(exchangeCountdown(undefined, NOW)).toBeNull();
  });
});
