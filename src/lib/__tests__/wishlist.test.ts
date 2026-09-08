import { describe, expect, it } from "vitest";
import { removeWish, toggleWish } from "../wishlist-store";

describe("wishlist helpers (§29)", () => {
  it("toggles ids on and off", () => {
    expect(toggleWish([], "p1")).toEqual(["p1"]);
    expect(toggleWish(["p1"], "p1")).toEqual([]);
    expect(toggleWish(["p1"], "p2")).toEqual(["p1", "p2"]);
  });

  it("removes a single id without touching others", () => {
    expect(removeWish(["p1", "p2", "p3"], "p2")).toEqual(["p1", "p3"]);
    expect(removeWish(["p1"], "p9")).toEqual(["p1"]);
  });
});
