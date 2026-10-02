import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOfferBeep } from "../use-offer-beep";

afterEach(() => vi.unstubAllGlobals());

describe("useOfferBeep", () => {
  it("vibrates once per genuinely new offer id, never for ids already on the board", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    const { rerender } = renderHook(({ ids }) => useOfferBeep(ids), { initialProps: { ids: [] as string[] } });
    expect(vibrate).not.toHaveBeenCalled();
    rerender({ ids: ["a"] });
    expect(vibrate).toHaveBeenCalledTimes(1);
    rerender({ ids: ["a"] });
    expect(vibrate).toHaveBeenCalledTimes(1);
    rerender({ ids: ["a", "b"] });
    expect(vibrate).toHaveBeenCalledTimes(2);
    rerender({ ids: ["b"] });
    expect(vibrate).toHaveBeenCalledTimes(2);
    rerender({ ids: ["a", "b"] }); // "a" came back → new again
    expect(vibrate).toHaveBeenCalledTimes(3);
  });

  it("a device with no audio or vibration stays silent without throwing", () => {
    vi.stubGlobal("navigator", {});
    expect(() => renderHook(() => useOfferBeep(["x"]))).not.toThrow();
  });
});
