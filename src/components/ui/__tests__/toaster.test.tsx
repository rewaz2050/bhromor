import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import Toaster from "@/components/ui/toaster";
import { __resetToast, showToast } from "@/lib/toast";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  __resetToast();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Toaster", () => {
  it("renders nothing until something is worth saying", () => {
    const { container } = render(<Toaster />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the message as a polite status, with an optional action", () => {
    render(<Toaster />);
    // The store is external to React: its updates must be wrapped in act().
    act(() => {
      showToast({
        message: "Added to bag · Size L",
        action: { label: "View bag", href: "/cart" },
      });
    });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Added to bag · Size L");
    expect(screen.getByRole("link", { name: /view bag/i })).toHaveAttribute(
      "href",
      "/cart",
    );
  });

  it("dismisses on the close button and stays hidden afterwards", () => {
    render(<Toaster />);
    act(() => {
      showToast({ message: "Link copied" });
    });
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("dismisses on Escape", () => {
    render(<Toaster />);
    act(() => {
      showToast({ message: "Link copied" });
    });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("carries the tone so a warning does not look like a success", () => {
    render(<Toaster />);
    act(() => {
      showToast({ message: "Could not copy the link", tone: "warn" });
    });
    expect(screen.getByRole("status")).toHaveAttribute("data-tone", "warn");
  });
});
