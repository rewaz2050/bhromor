import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Reveal from "../reveal";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Place the element below the fold (or on screen) for the mount check. */
const placeAt = (top: number) => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    top,
    bottom: top + 100,
    left: 0,
    right: 100,
    width: 100,
    height: 100,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect);
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
};

describe("Progressive editorial reveal", () => {
  it("leaves content visible when browser animation APIs are unavailable", () => {
    render(
      <Reveal>
        <h2>Thoughtful essentials</h2>
      </Reveal>,
    );
    expect(screen.getByRole("heading")).toBeVisible();
  });

  it("does not observe or hide when reduced motion is requested", () => {
    const observe = vi.fn();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
      },
    );
    placeAt(2000);
    render(
      <Reveal>
        <h2>Thoughtful essentials</h2>
      </Reveal>,
    );
    expect(observe).not.toHaveBeenCalled();
    const el = screen.getByRole("heading").parentElement as HTMLElement;
    expect(el.classList.contains("reveal-pending")).toBe(false);
    expect(screen.getByRole("heading")).toBeVisible();
  });

  it("never hides a block that is already on screen at mount (first paint = final paint)", () => {
    const observe = vi.fn();
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe = observe;
        disconnect = vi.fn();
      },
    );
    placeAt(300); // inside an 800px viewport
    render(
      <Reveal>
        <h2>Thoughtful essentials</h2>
      </Reveal>,
    );
    const el = screen.getByRole("heading").parentElement as HTMLElement;
    expect(el.classList.contains("reveal-pending")).toBe(false);
    expect(observe).not.toHaveBeenCalled();
  });

  it("hides a below-the-fold block, reveals it on entry via CSS classes and cleans up on unmount", () => {
    let intersect: IntersectionObserverCallback | undefined;
    const disconnect = vi.fn();
    const removeEventListener = vi.fn();
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
    placeAt(2000);
    const { unmount } = render(
      <Reveal delay={120}>
        <h2>Thoughtful essentials</h2>
      </Reveal>,
    );
    const el = screen.getByRole("heading").parentElement as HTMLElement;
    expect(el.classList.contains("reveal-pending")).toBe(true);
    expect(el.classList.contains("reveal-shown")).toBe(false);
    expect(el.style.transitionDelay).toBe("120ms");
    // no blur filter, no Web Animation — compositor-only CSS
    expect(el.style.filter).toBe("");

    intersect?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
    expect(el.classList.contains("reveal-shown")).toBe(true);
    expect(disconnect).toHaveBeenCalled();

    unmount();
    expect(el.classList.contains("reveal-pending")).toBe(false);
    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });
});
