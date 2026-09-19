import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import PageProgress from "@/components/ui/page-progress";

let pathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

/** A calm device: motion allowed unless a test says otherwise. */
const allowMotion = (allowed: boolean) => {
  window.matchMedia = ((query: string) =>
    ({
      matches: query.includes("prefers-reduced-motion") ? !allowed : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      onchange: null,
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
};

const link = (href: string, attrs: Record<string, string> = {}) => {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.textContent = href;
  for (const [key, value] of Object.entries(attrs)) {
    anchor.setAttribute(key, value);
  }
  document.body.appendChild(anchor);
  return anchor;
};

beforeEach(() => {
  pathname = "/";
  allowMotion(true);
  vi.useFakeTimers();
  /* jsdom cannot navigate, and says so on every link click here. The bar's
     job is to start before navigation — that is what the tests assert. */
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (String(args[0] ?? "").includes("Not implemented: navigation")) return;
    console.warn(...args);
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  for (const key of ["matchMedia"]) {
    delete (window as unknown as Record<string, unknown>)[key];
  }
});

describe("PageProgress", () => {
  it("shows nothing until a navigation starts", () => {
    render(<PageProgress />);
    expect(screen.queryByTestId("page-progress")).toBeNull();
  });

  it("starts on a tap on an internal link and creeps without arriving", () => {
    render(<PageProgress />);
    const anchor = link("/shop");
    act(() => {
      fireEvent.click(anchor);
    });
    const bar = screen.getByTestId("page-progress");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.width).toBe("12%");

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    const width = Number(fill.style.width.replace("%", ""));
    expect(width).toBeGreaterThan(12);
    expect(width).toBeLessThanOrEqual(90);
  });

  it("lands and hides once the route commits", () => {
    const view = render(<PageProgress />);
    act(() => {
      fireEvent.click(link("/shop"));
    });
    expect(screen.getByTestId("page-progress")).toBeInTheDocument();

    pathname = "/shop";
    act(() => {
      view.rerender(<PageProgress />);
    });
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.queryByTestId("page-progress")).toBeNull();
  });

  it("ignores hash jumps, downloads, new tabs, external hosts and modified clicks", () => {
    render(<PageProgress />);
    const cases: [HTMLAnchorElement, MouseEventInit?][] = [
      [link("#collections")],
      [link("/files/lookbook.pdf", { download: "" })],
      [link("/shop", { target: "_blank" })],
      [link("https://wa.me/8801700000000")],
      [link("mailto:shop@prosanti.store")],
      [link("/shop"), { metaKey: true }],
      [link("/shop"), { button: 1 }],
    ];
    for (const [anchor, init] of cases) {
      act(() => {
        fireEvent.click(anchor, init);
      });
      expect(screen.queryByTestId("page-progress")).toBeNull();
    }
  });

  it("stays quiet when the shopper prefers reduced motion", () => {
    allowMotion(false);
    render(<PageProgress />);
    act(() => {
      fireEvent.click(link("/shop"));
    });
    expect(screen.queryByTestId("page-progress")).toBeNull();
  });
});
