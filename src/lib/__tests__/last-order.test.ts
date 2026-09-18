/**
 * P0 #5 — the receipt remembers the order it just placed; /track offers it
 * back with one tap and the receipt link carries both lookup fields.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  LAST_ORDER_KEY,
  clearLastOrder,
  readLastOrder,
  saveLastOrder,
  trackHref,
} from "@/lib/last-order";

beforeEach(() => {
  window.localStorage.clear();
});

describe("last-order shortcut", () => {
  it("round-trips id, phone, placedAt and total", () => {
    saveLastOrder({ id: "PS-20260918-0001", phone: "01712345678", placedAt: 1_000, total: 156000 });
    expect(readLastOrder(2_000)).toEqual({
      id: "PS-20260918-0001",
      phone: "01712345678",
      placedAt: 1_000,
      total: 156000,
    });
  });

  it("expires after a week and clears the stale record", () => {
    saveLastOrder({ id: "PS-1", phone: "017", placedAt: 0 });
    expect(readLastOrder(8 * 86_400_000)).toBeNull();
    expect(window.localStorage.getItem(LAST_ORDER_KEY)).toBeNull();
  });

  it("ignores garbage without throwing", () => {
    window.localStorage.setItem(LAST_ORDER_KEY, "{not json");
    expect(readLastOrder()).toBeNull();
    window.localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ id: 5 }));
    expect(readLastOrder()).toBeNull();
  });

  it("clearLastOrder removes the record", () => {
    saveLastOrder({ id: "PS-1", phone: "017", placedAt: Date.now() });
    clearLastOrder();
    expect(readLastOrder()).toBeNull();
  });

  it("trackHref encodes both fields", () => {
    expect(trackHref("PS-20260918-0001", "+8801712345678")).toBe(
      "/track?id=PS-20260918-0001&phone=%2B8801712345678",
    );
  });
});
