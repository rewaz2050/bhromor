import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { newOfferIds, offerTitle, useOfferAlert } from "../use-offer-alert";

describe("offer alert helpers", () => {
  it("finds only ids not seen before", () => {
    expect(newOfferIds(new Set(["a"]), ["a", "b"])).toEqual(["b"]);
    expect(newOfferIds(new Set(), [])).toEqual([]);
  });
  it("prefixes the tab title with the pending count", () => {
    expect(offerTitle(0, "Rider")).toBe("Rider");
    expect(offerTitle(2, "Rider")).toContain("(2)");
  });
});

describe("useOfferAlert", () => {
  const vibrate = vi.fn();
  beforeEach(() => {
    vibrate.mockClear();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    document.title = "Rider";
  });
  afterEach(cleanup);

  it("never alerts on the first board load, alerts when a new offer arrives", () => {
    const onNew = vi.fn();
    const { rerender } = renderHook(({ ids }) => useOfferAlert(ids, onNew), { initialProps: { ids: ["a"] } });
    expect(onNew).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
    expect(document.title).toContain("(1)");

    rerender({ ids: ["a"] });
    expect(onNew).not.toHaveBeenCalled();

    rerender({ ids: ["a", "b"] });
    expect(onNew).toHaveBeenCalledWith(1);
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(document.title).toContain("(2)");

    // An answered offer coming back is not "new"; an empty board restores the title.
    rerender({ ids: [] });
    expect(document.title).toBe("Rider");
    rerender({ ids: ["a"] });
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  it("restores the title on unmount", () => {
    const { unmount } = renderHook(() => useOfferAlert(["x"]));
    expect(document.title).toContain("(1)");
    unmount();
    expect(document.title).toBe("Rider");
  });
});
