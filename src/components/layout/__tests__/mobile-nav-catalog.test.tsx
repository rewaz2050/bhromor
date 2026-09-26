/**
 * The phone menu with a live catalog (menubar redesign, 2026-09-26): quick
 * actions, the shop entries, then every category with pieces as a direct
 * link into the filtered shop — plus Offers only while something is on
 * offer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import MobileNav from "@/components/layout/mobile-nav";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";

vi.mock("next/navigation", () => ({ usePathname: () => "/shop" }));
vi.mock("@/lib/use-live-catalog", () => ({
  useLiveCatalog: () => ({
    products: PRODUCTS,
    categories: CATEGORIES,
    shops: [],
    live: true,
    loading: false,
    liveCategories: CATEGORIES,
  }),
}));
vi.mock("@/lib/use-wishlist", () => ({
  useWishlist: () => ({ count: 3 }),
}));

afterEach(cleanup);

const open = () => {
  render(<MobileNav />);
  fireEvent.click(screen.getByRole("button", { name: /open menu/i }));
};

describe("MobileNav — with the catalog", () => {
  it("offers the three quick actions up top, wishlist with its count", () => {
    open();
    expect(screen.getByRole("link", { name: /^Account/ })).toHaveAttribute("href", "/account");
    const wishlist = screen.getByRole("link", { name: /^Wishlist/ });
    expect(wishlist).toHaveAttribute("href", "/wishlist");
    expect(wishlist).toHaveTextContent("3");
    expect(screen.getByRole("link", { name: "Track Order" })).toHaveAttribute("href", "/track");
  });

  it("lists every category with pieces as a link into the filtered shop", () => {
    open();
    const nav = screen.getByRole("navigation", { name: "Categories" });
    for (const category of CATEGORIES) {
      const link = screen.getByRole("link", { name: new RegExp(`^${category.name}`) });
      expect(nav.contains(link)).toBe(true);
      expect(link).toHaveAttribute("href", `/shop?category=${category.id}`);
    }
    // The heading itself still jumps to the home shelf.
    expect(screen.getByRole("link", { name: "Categories" })).toHaveAttribute(
      "href",
      "/#collections",
    );
  });

  it("marks the current section and shows Offers only while a piece is on offer", () => {
    open();
    expect(screen.getByRole("link", { name: "Shop" })).toHaveAttribute("aria-current", "page");
    const onOffer = PRODUCTS.some(
      (p) => p.compareAtPrice !== undefined && p.compareAtPrice > p.price,
    );
    expect(!!screen.queryByRole("link", { name: "Offers" })).toBe(onOffer);
  });
});
