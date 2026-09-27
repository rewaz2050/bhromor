/** UX plan §10 (R7) — the remembered style is device-local, sane and stale-aware. */
import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetStyleMemoryForTests,
  clearStyleQuery,
  getStoredStyle,
  saveStyleQuery,
  STYLE_QUERY_KEY,
  STYLE_QUERY_TTL_MS,
  subscribeStoredStyle,
} from "../style-memory";

beforeEach(() => {
  localStorage.clear();
  __resetStyleMemoryForTests();
});

describe("style memory", () => {
  it("remembers a real query, notifies subscribers, and forgets on an empty one", () => {
    let pings = 0;
    const off = subscribeStoredStyle(() => pings++);
    expect(getStoredStyle()).toBeNull();

    saveStyleQuery({ occasion: "eid", budgetTaka: 2500, colors: ["Ivory"], size: "L", categoryId: null });
    expect(getStoredStyle()?.query).toMatchObject({ occasion: "eid", budgetTaka: 2500, size: "L" });
    expect(JSON.parse(localStorage.getItem(STYLE_QUERY_KEY)!).query.colors).toEqual(["Ivory"]);
    expect(pings).toBe(1);

    clearStyleQuery();
    expect(getStoredStyle()).toBeNull();
    expect(localStorage.getItem(STYLE_QUERY_KEY)).toBeNull();
    expect(pings).toBe(2);
    off();
  });

  it("drops junk, over-long lists and stale memories instead of trusting storage", () => {
    localStorage.setItem(STYLE_QUERY_KEY, "not json");
    expect(getStoredStyle()).toBeNull();
    __resetStyleMemoryForTests();

    localStorage.setItem(
      STYLE_QUERY_KEY,
      JSON.stringify({ query: { colors: ["a", "b", "c", "d", 5], budgetTaka: "lots" }, at: Date.now() }),
    );
    expect(getStoredStyle()?.query).toEqual({
      occasion: undefined,
      budgetTaka: null,
      colors: ["a", "b", "c"],
      size: null,
      categoryId: null,
    });
    __resetStyleMemoryForTests();

    localStorage.setItem(
      STYLE_QUERY_KEY,
      JSON.stringify({ query: { size: "M" }, at: Date.now() - STYLE_QUERY_TTL_MS - 1 }),
    );
    expect(getStoredStyle()).toBeNull();
  });
});
