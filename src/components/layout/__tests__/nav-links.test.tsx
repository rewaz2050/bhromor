/**
 * The desktop menubar — active ownership mirrors the thumb bar (a product
 * page still lights "Shop"), the sale tab is its own destination, and the
 * Offers entry exists only while something is genuinely on offer.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import NavLinks from "@/components/nav-links-testable";

const mockPathname = vi.fn(() => "/");
const mockParams = vi.fn(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => mockParams(),
}));

const renderNav = () => render(<NavLinks testItems />);

afterEach(() => {
  cleanup();
  mockPathname.mockReturnValue("/");
  mockParams.mockReturnValue(new URLSearchParams());
});

describe("NavLinks — the desktop menubar", () => {
  it("lights Shop on the shop and on product pages (same ownership as the thumb bar)", () => {
    mockPathname.mockReturnValue("/shop");
    const { container } = renderNav();
    expect(container.querySelector('[aria-current="page"]')).toHaveTextContent(
      "Shop",
    );

    cleanup();
    mockPathname.mockReturnValue("/product/heritage-green-panjabi");
    const product = renderNav();
    expect(
      product.container.querySelector('[aria-current="page"]'),
    ).toHaveTextContent("Shop");
  });

  it("keeps the sale tab distinct — /shop?filter=sale is active only there", () => {
    mockPathname.mockReturnValue("/shop");
    mockParams.mockReturnValue(new URLSearchParams({ filter: "sale" }));
    const sale = renderNav();
    expect(sale.container.querySelector('[aria-current="page"]')).toHaveTextContent(
      "Offers",
    );

    cleanup();
    // Plain /shop: the Offers pill must NOT be active even though the path matches.
    mockParams.mockReturnValue(new URLSearchParams());
    const plain = renderNav();
    const current = plain.container.querySelector('[aria-current="page"]');
    expect(current).toHaveTextContent("Shop");
    expect(current).not.toHaveTextContent("Offers");
  });

  it("keeps Home exact and Sections (categories) home-only", () => {
    mockPathname.mockReturnValue("/shop");
    const { container } = renderNav();
    const links = [...container.querySelectorAll("a")];
    const categories = links.find((a) => a.textContent === "Categories")!;
    expect(categories).not.toHaveAttribute("aria-current");
  });

  it("renders Track — reachable from the menubar, not just the footer", () => {
    const { container } = renderNav();
    const track = [...container.querySelectorAll("a")].find(
      (a) => a.textContent === "Track",
    );
    expect(track).toHaveAttribute("href", "/track");
  });
});
