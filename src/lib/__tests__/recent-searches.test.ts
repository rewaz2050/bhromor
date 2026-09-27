import { beforeEach, describe, expect, it } from "vitest";
import {
  RECENT_SEARCHES_KEY,
  RECENT_SEARCHES_MAX,
  clearRecentSearches,
  getRecentSearches,
  rememberSearch,
} from "@/lib/recent-searches";

beforeEach(() => localStorage.clear());

describe("recent searches (device only)", () => {
  it("keeps the newest first, dedupes case-insensitively and caps the list", () => {
    rememberSearch("panjabi");
    rememberSearch("শার্ট");
    rememberSearch("Panjabi");
    expect(getRecentSearches()).toEqual(["Panjabi", "শার্ট"]);
    for (let i = 0; i < RECENT_SEARCHES_MAX + 3; i += 1) rememberSearch(`term ${i}`);
    expect(getRecentSearches()).toHaveLength(RECENT_SEARCHES_MAX);
    expect(getRecentSearches()[0]).toBe(`term ${RECENT_SEARCHES_MAX + 2}`);
  });

  it("ignores one-character noise and survives a corrupt store", () => {
    expect(rememberSearch(" a ")).toEqual([]);
    localStorage.setItem(RECENT_SEARCHES_KEY, "{not json");
    expect(getRecentSearches()).toEqual([]);
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify([1, "ok", "x", null]));
    expect(getRecentSearches()).toEqual(["ok"]);
  });

  it("clear removes the key entirely", () => {
    rememberSearch("lungi");
    expect(clearRecentSearches()).toEqual([]);
    expect(localStorage.getItem(RECENT_SEARCHES_KEY)).toBeNull();
  });
});
