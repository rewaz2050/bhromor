import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Reveal from "../reveal";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Progressive editorial reveal", () => {
  it("leaves content visible when browser animation APIs are unavailable", () => {
    render(
      <Reveal>
        <h2>Thoughtful essentials</h2>
      </Reveal>,
    );
    expect(screen.getByRole("heading")).toBeVisible();
  });
  it("does not observe or animate when reduced motion is requested", () => {
    const observe = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
      },
    );
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    render(
      <Reveal>
        <h2>Thoughtful essentials</h2>
      </Reveal>,
    );
    expect(observe).not.toHaveBeenCalled();
    expect(animate).not.toHaveBeenCalled();
    expect(screen.getByRole("heading")).toBeVisible();
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });
  it("animates on entry and releases observer and animation on unmount", () => {
    let intersect: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    const cancel = vi.fn();
    const removeEventListener = vi.fn();
    const animate = vi.fn(() => ({ cancel }));
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener,
    }));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(callback: IntersectionObserverCallback) {
          intersect = callback;
        }
        observe = vi.fn();
        disconnect = disconnect;
      },
    );
    const { unmount } = render(
      <Reveal>
        <h2>Thoughtful essentials</h2>
      </Reveal>,
    );
    expect(animate).not.toHaveBeenCalled();
    intersect?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    expect(animate).toHaveBeenCalledTimes(1);
    expect(disconnect).toHaveBeenCalled();
    unmount();
    expect(cancel).toHaveBeenCalled();
    expect(removeEventListener).toHaveBeenCalledWith(
      "change",
      expect.any(Function),
    );
    delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  });
});
