import { afterEach, describe, expect, it, vi } from "vitest";
import { haptic } from "../haptics";

describe("haptics — a small buzz where a tap lands something", () => {
  const vibrate = vi.fn();

  afterEach(() => {
    vi.unstubAllGlobals();
    vibrate.mockClear();
  });

  it("calls navigator.vibrate with the pattern — success is a double tick", () => {
    vi.stubGlobal("navigator", { vibrate });
    haptic("tap");
    expect(vibrate).toHaveBeenCalledWith(8);
    haptic("success");
    expect(vibrate).toHaveBeenCalledWith([12, 40, 18]);
  });

  it("is silent where the API does not exist (iOS Safari, jsdom)", () => {
    vi.stubGlobal("navigator", {});
    expect(() => haptic("success")).not.toThrow();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("survives a device that throws", () => {
    vi.stubGlobal("navigator", {
      vibrate: () => {
        throw new Error("no");
      },
    });
    expect(() => haptic("tap")).not.toThrow();
  });
});
