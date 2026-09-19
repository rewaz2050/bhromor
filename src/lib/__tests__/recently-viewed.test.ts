import { beforeEach, describe, expect, it } from "vitest";
import {
  RECENTLY_VIEWED_KEY,
  RECENTLY_VIEWED_MAX,
  clearRecentlyViewed,
  dropRecentlyViewed,
  getRecentlyViewed,
  pushRecentlyViewed,
  pushView,
  parseViews,
} from "@/lib/recently-viewed";

const entry = (id: string, at = 0) => ({ id, slug: `${id}-slug`, at });

beforeEach(() => {
  localStorage.clear();
  // The store keeps an in-memory cache; clear() re-persists an empty list.
  clearRecentlyViewed();
});

describe("recently-viewed helpers", () => {
  it("keeps the newest look first and never repeats a product", () => {
    let list = pushView([], { id: "p1", slug: "one" }, 100);
    list = pushView(list, { id: "p2", slug: "two" }, 200);
    list = pushView(list, { id: "p1", slug: "one" }, 300);
    expect(list.map((row) => row.id)).toEqual(["p1", "p2"]);
    expect(list[0].at).toBe(300);
  });

  it("caps the trail so localStorage never grows without bound", () => {
    let list: ReturnType<typeof pushView> = [];
    for (let i = 0; i < RECENTLY_VIEWED_MAX + 5; i += 1) {
      list = pushView(list, { id: `p${i}`, slug: `s${i}` }, i);
    }
    expect(list).toHaveLength(RECENTLY_VIEWED_MAX);
    expect(list[0].id).toBe(`p${RECENTLY_VIEWED_MAX + 4}`);
  });

  it("ignores an entry with no id", () => {
    const list = pushView([entry("p1")], { id: "", slug: "x" });
    expect(list.map((row) => row.id)).toEqual(["p1"]);
  });

  it("survives corrupt or hostile storage payloads", () => {
    expect(parseViews(null)).toEqual([]);
    expect(parseViews("not json")).toEqual([]);
    expect(parseViews("{}")).toEqual([]);
    expect(
      parseViews(
        JSON.stringify([
          { id: "p1", slug: "one", at: 5 },
          { id: "p1", slug: "dupe", at: 6 },
          { id: 42, slug: "wrong type" },
          null,
          { id: "p2", slug: "two" },
        ]),
      ),
    ).toEqual([
      { id: "p1", slug: "one", at: 5 },
      { id: "p2", slug: "two", at: 0 },
    ]);
  });
});

describe("recently-viewed store", () => {
  it("persists the trail and reads it back", () => {
    pushRecentlyViewed({ id: "p1", slug: "one" });
    pushRecentlyViewed({ id: "p2", slug: "two" });
    expect(getRecentlyViewed().map((row) => row.id)).toEqual(["p2", "p1"]);
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    expect(raw).toContain("p2");
  });

  it("stores ids and slugs only — never a cached price or name", () => {
    pushRecentlyViewed({ id: "p1", slug: "one" });
    const stored = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? "[]");
    expect(Object.keys(stored[0]).sort()).toEqual(["at", "id", "slug"]);
  });

  it("drops a single entry and clears the whole trail", () => {
    pushRecentlyViewed({ id: "p1", slug: "one" });
    pushRecentlyViewed({ id: "p2", slug: "two" });
    dropRecentlyViewed("p1");
    expect(getRecentlyViewed().map((row) => row.id)).toEqual(["p2"]);
    clearRecentlyViewed();
    expect(getRecentlyViewed()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? "null")).toEqual([]);
  });
});
