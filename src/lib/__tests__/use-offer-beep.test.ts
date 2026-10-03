import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useOfferBeep } from "../use-offer-beep";

afterEach(() => vi.unstubAllGlobals());

describe("useOfferBeep", () => {
  const stubAudio = () => {
    const made = vi.fn();
    class FakeCtx {
      currentTime = 0;
      destination = {};
      constructor() { made(); }
      createOscillator() { return { connect() {}, start() {}, stop() {}, frequency: { value: 0 } }; }
      createGain() { return { connect() {}, gain: { value: 0 } }; }
      close() { return Promise.resolve(); }
    }
    vi.stubGlobal("AudioContext", FakeCtx);
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx;
    return made;
  };

  it("beeps once per genuinely new offer id, never for ids already on the board", () => {
    const made = stubAudio();
    const { rerender } = renderHook(({ ids }) => useOfferBeep(ids), { initialProps: { ids: [] as string[] } });
    expect(made).not.toHaveBeenCalled();
    rerender({ ids: ["a"] });
    expect(made).toHaveBeenCalledTimes(1);
    rerender({ ids: ["a"] });
    expect(made).toHaveBeenCalledTimes(1);
    rerender({ ids: ["a", "b"] });
    expect(made).toHaveBeenCalledTimes(2);
    rerender({ ids: ["b"] });
    expect(made).toHaveBeenCalledTimes(2);
    rerender({ ids: ["a", "b"] }); // "a" came back → new again
    expect(made).toHaveBeenCalledTimes(3);
  });

  it("never vibrates — use-offer-alert owns the vibration, so the two patterns cannot fight", () => {
    const vibrate = vi.fn();
    vi.stubGlobal("navigator", { vibrate });
    stubAudio();
    const { rerender } = renderHook(({ ids }) => useOfferBeep(ids), { initialProps: { ids: [] as string[] } });
    rerender({ ids: ["a"] });
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("a device with no audio or vibration stays silent without throwing", () => {
    vi.stubGlobal("navigator", {});
    expect(() => renderHook(() => useOfferBeep(["x"]))).not.toThrow();
  });
});
