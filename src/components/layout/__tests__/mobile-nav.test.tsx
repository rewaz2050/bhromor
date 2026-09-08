import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import MobileNav from "@/components/layout/mobile-nav";

/**
 * Regression tests for the reported "menu open hoy na" bug.
 *
 * The drawer used to render inside the sticky header, whose `backdrop-blur`
 * turns it into the containing block for fixed children — so the panel was
 * clipped to the 64px header strip and effectively invisible. It is now
 * portalled to <body>.
 */

const mockPathname = vi.fn(() => "/");
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

describe("MobileNav", () => {
  beforeEach(() => {
    cleanup();
    mockPathname.mockReturnValue("/");
    document.body.style.overflow = "";
  });

  it("is closed initially and advertises its state", () => {
    render(<MobileNav />);
    const toggle = screen.getByRole("button", { name: /open menu/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens the menu and renders it outside the header, directly on <body>", () => {
    const { container } = render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));

    const dialog = screen.getByRole("dialog", { name: /menu/i });
    expect(dialog).toBeInTheDocument();
    // Portalled: not a descendant of the component's own (header) subtree.
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.parentElement).toBe(document.body);

    expect(screen.getByRole("link", { name: "Shop" })).toHaveAttribute(
      "href",
      "/shop",
    );
    expect(screen.getByRole("link", { name: "Collections" })).toHaveAttribute(
      "href",
      "/#collections",
    );
    expect(screen.getByRole("link", { name: "Track Order" })).toBeInTheDocument();
  });

  it("locks background scrolling while open and restores it on close", () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(screen.getByRole("button", { name: /close menu/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("closes on Escape", () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when a link navigates to another page", () => {
    const { rerender } = render(<MobileNav />);
    fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    mockPathname.mockReturnValue("/shop");
    rerender(<MobileNav />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when the scrim behind the panel is clicked", () => {
    render(<MobileNav />);
    const toggle = screen.getByRole("button", { name: /open menu/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    const scrim = screen.getByRole("dialog").firstElementChild as HTMLElement;
    fireEvent.click(scrim);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("moves focus into the panel when it opens", async () => {
    vi.useFakeTimers();
    try {
      render(<MobileNav />);
      fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
      act(() => vi.runAllTimers());
      const dialog = screen.getByRole("dialog");
      expect(dialog.contains(document.activeElement)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
