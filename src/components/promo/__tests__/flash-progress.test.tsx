import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { FlashProgress } from "@/components/promo/flash-timer";

/**
 * Scroll audit 2026-09-27 — the flash strip's progress line is one CSS
 * transform transition handed to the compositor, not a width restyled from
 * a 1 s React tick.
 */

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("FlashProgress", () => {
  it("starts at the share already elapsed and transitions to full over what is left", () => {
    vi.useFakeTimers({ now: 1_000_000 });
    // Store froze the window with 30 min left at 25 % elapsed → a 40 min window.
    const endsAt = 1_000_000 + 30 * 60_000;
    const { getByTestId } = render(
      <FlashProgress endsAtMs={endsAt} msLeftAt={30 * 60_000} progressAt={0.25} />,
    );
    const line = getByTestId("flash-progress") as HTMLElement;
    expect(line.style.transform).toBe("scaleX(1)");
    expect(line.style.transition).toBe(`transform ${30 * 60_000}ms linear`);
    expect(line.className).toMatch(/origin-left/);
    expect(line.style.width).toBe("");
  });

  it("re-derives the current share when the strip mounts later in the window", () => {
    // Frozen at 0 % with 40 min left; the strip mounts 10 min in, under
    // reduced motion so the derived start value stays visible: 10/40 = 25 %.
    vi.useFakeTimers({ now: 5_000_000 + 10 * 60_000 });
    const matchMedia = window.matchMedia;
    window.matchMedia = ((q: string) =>
      ({ matches: /reduce/.test(q), media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList) as typeof window.matchMedia;
    const endsAt = 5_000_000 + 40 * 60_000;
    const { getByTestId } = render(
      <FlashProgress endsAtMs={endsAt} msLeftAt={40 * 60_000} progressAt={0} />,
    );
    const line = getByTestId("flash-progress") as HTMLElement;
    expect(line.style.transform).toBe("scaleX(0.2500)");
    expect(line.style.transition).toBe("none");
    window.matchMedia = matchMedia;
  });

  it("is simply full once the window has closed", () => {
    vi.useFakeTimers({ now: 2_000_000 + 60_000 });
    const { getByTestId } = render(
      <FlashProgress endsAtMs={2_000_000 + 60_000} msLeftAt={60_000} progressAt={0.5} />,
    );
    const line = getByTestId("flash-progress") as HTMLElement;
    expect(line.style.transform).toBe("scaleX(1.0000)");
    expect(line.style.transition).toBe("none");
  });
});
