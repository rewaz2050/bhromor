/**
 * The desktop "Categories" entry (menubar redesign, 2026-09-26): a plain
 * link until the catalog answers, then a disclosure that lists every
 * category with pieces and closes on Escape, an outside click and a
 * navigation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CategoryMenu from "@/components/layout/category-menu";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";

const mockPathname = vi.fn(() => "/");
const mockParams = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => mockParams(),
}));

const catalog = vi.hoisted(() => ({
  products: [] as unknown[],
  categories: [] as unknown[],
}));
vi.mock("@/lib/use-live-catalog", () => ({
  useLiveCatalog: () => ({
    products: catalog.products,
    categories: catalog.categories,
    shops: [],
    live: catalog.products.length > 0,
    loading: false,
    liveCategories: catalog.categories,
  }),
}));

const renderMenu = () =>
  render(<CategoryMenu label="Categories" fallbackHref="/#collections" />);

beforeEach(() => {
  catalog.products = PRODUCTS;
  catalog.categories = CATEGORIES;
  mockPathname.mockReturnValue("/");
});
afterEach(cleanup);

describe("CategoryMenu", () => {
  it("is the plain home-shelf link while the catalog is empty", () => {
    catalog.products = [];
    catalog.categories = [];
    renderMenu();
    expect(screen.getByRole("link", { name: "Categories" })).toHaveAttribute(
      "href",
      "/#collections",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("opens on click and lists every category with pieces as shop links", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Categories" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    const panel = screen.getByRole("group", { name: "Browse by category" });
    for (const category of CATEGORIES) {
      const link = screen.getByRole("link", { name: new RegExp(`^${category.name}`) });
      expect(panel.contains(link)).toBe(true);
      expect(link).toHaveAttribute("href", `/shop?category=${category.id}`);
    }
    // Garment types deep-link into the filtered shop.
    expect(screen.getByRole("link", { name: "Panjabi" })).toHaveAttribute(
      "href",
      "/shop?category=men&sub=Panjabi",
    );
    expect(screen.getByRole("link", { name: /All Products/ })).toHaveAttribute(
      "href",
      "/shop",
    );
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    renderMenu();
    const trigger = screen.getByRole("button", { name: "Categories" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("group")).toBeInTheDocument();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when the shopper clicks anywhere else", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    expect(screen.getByRole("group")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("closes after a navigation", () => {
    const { rerender } = renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "Categories" }));
    expect(screen.getByRole("group")).toBeInTheDocument();
    mockPathname.mockReturnValue("/shop");
    act(() => {
      rerender(<CategoryMenu label="Categories" fallbackHref="/#collections" />);
    });
    expect(screen.queryByRole("group")).toBeNull();
  });
});
