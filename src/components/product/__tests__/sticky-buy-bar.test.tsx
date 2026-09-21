/**
 * The sticky buy bar — hidden while the purchase panel is on screen, docks
 * in when it scrolls away, and tapping "Add" scrolls back to the real CTA.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import StickyBuyBar from "@/components/product/sticky-buy-bar";
import { PRODUCTS } from "@/lib/catalog";
import { LanguageProvider } from "@/components/i18n/language-provider";

const product = PRODUCTS.find((p) => p.inStock)!;

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];
  callback: (entries: { isIntersecting: boolean }[]) => void;
  constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
    this.callback = callback;
    MockIntersectionObserver.instances.push(this);
  }
  observe = vi.fn();
  disconnect = vi.fn();
  unobserve = vi.fn();
}
const IO = MockIntersectionObserver as unknown as typeof IntersectionObserver;

const mount = () => {
  document.body.innerHTML = '<div id="purchase-panel"></div>';
  const scroll = vi.fn();
  const panel = document.getElementById("purchase-panel")!;
  panel.scrollIntoView = scroll;
  const { container } = render(
    <LanguageProvider>
      <StickyBuyBar product={product} />
    </LanguageProvider>,
  );
  return { container, scroll };
};

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", IO);
  MockIntersectionObserver.instances = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

describe("StickyBuyBar — the dock that waits at the bottom edge", () => {
  it("starts hidden while the panel is on screen", () => {
    const { container } = mount();
    const bar = container.querySelector('[data-testid="sticky-buy-bar"]')!;
    expect(bar.getAttribute("data-visible")).toBe("false");
    expect(bar.className).toContain("translate-y-full");
  });

  it("docks in when the panel scrolls out and shows the piece + price", () => {
    const { container } = mount();
    const observer = MockIntersectionObserver.instances[0]!;
    act(() => observer.callback([{ isIntersecting: false }]));
    const bar = container.querySelector('[data-testid="sticky-buy-bar"]')!;
    expect(bar.getAttribute("data-visible")).toBe("true");
    expect(bar).toHaveTextContent(product.name);
    expect(bar.textContent).toMatch(/৳/);
    // The real CTA stays reachable — "Add" scrolls back to it.
    fireEvent.click(screen.getByRole("button", { name: /Add/ }));
    expect(
      document.getElementById("purchase-panel")!.scrollIntoView,
    ).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("hides again when the shopper scrolls the panel back up", () => {
    const { container } = mount();
    const observer = MockIntersectionObserver.instances[0]!;
    act(() => observer.callback([{ isIntersecting: false }]));
    act(() => observer.callback([{ isIntersecting: true }]));
    expect(
      container.querySelector('[data-testid="sticky-buy-bar"]')!.className,
    ).toContain("translate-y-full");
  });
});
