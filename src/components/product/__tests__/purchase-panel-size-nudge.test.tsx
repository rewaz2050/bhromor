/**
 * UX audit 2026-09-18, P1 #10 / #11 — the size step teaches instead of
 * blocking:
 *   • a tap on "Select a size" (main CTA or the sticky bar) scrolls the size
 *     row into view and pulses it; nothing is added to the bag
 *   • the sticky bar offers the sizes itself while none is picked
 *   • the three size helpers sit behind ONE "Size help" row and keep their
 *     own names (finder / guide / stylist) once opened
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PurchasePanel from "@/components/product/purchase-panel";
import { CartProvider, useCart } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { __resetSizeProfile } from "@/lib/size-finder";
import { __resetPromos } from "@/lib/use-promos";

vi.mock("@/lib/use-live-catalog", async () => {
  const { CATEGORIES, PRODUCTS } = await import("@/lib/catalog");
  return {
    useLiveCatalog: () => ({
      products: PRODUCTS,
      categories: CATEGORIES,
      shops: [],
      live: false,
      loading: false,
      liveCategories: CATEGORIES,
    }),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

const product = PRODUCTS.find((p) => p.sizes.length > 1 && p.inStock)!;

function CartCount() {
  const { itemCount } = useCart();
  return <output aria-label="Items in bag">{itemCount}</output>;
}

const renderPanel = () =>
  render(
    <LanguageProvider>
      <CartProvider>
        <PurchasePanel product={product} />
        <CartCount />
      </CartProvider>
    </LanguageProvider>,
  );

const sizeButtons = () =>
  screen
    .getAllByRole("button")
    .filter((b) => b.hasAttribute("data-size-fit") && product.sizes.includes((b.textContent ?? "").trim()));

beforeEach(() => {
  localStorage.clear();
  __resetPromos();
  __resetSizeProfile();
  // The bag counts through the live registry — serve the rows there too.
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))),
  );
  // jsdom has no layout — the nudge calls this, so give it something to call.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  __resetPromos();
  __resetSizeProfile();
  __resetLiveCatalog();
  vi.unstubAllGlobals();
});

describe("Buy box — size nudge (P1 #10)", () => {
  it("a tap on 'Select a size' scrolls to the size row and adds nothing", async () => {
    renderPanel();
    const ctas = await screen.findAllByRole("button", { name: "Select a size" });
    // Main CTA + sticky bar CTA — both are tappable (not disabled) so the tap can teach.
    expect(ctas.length).toBeGreaterThanOrEqual(2);
    for (const cta of ctas) expect(cta).not.toBeDisabled();
    fireEvent.click(ctas[0]);
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    // The row pulses…
    const group = screen.getByTestId("size-row").querySelector("[role=group]");
    expect(group?.className).toContain("size-nudge");
    // …and the bag is untouched.
    expect(screen.queryByText(/Added to cart/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Items in bag")).toHaveTextContent("0");
  });

  it("the sticky bar offers the sizes while none is picked, then adds with the chosen one", async () => {
    renderPanel();
    const pills = await screen.findByTestId("sticky-size-pills");
    expect(pills.querySelectorAll("button").length).toBe(product.sizes.length);
    fireEvent.click(pills.querySelectorAll("button")[1]);
    // Size chosen → pills fold away, CTA reads "Add to Bag" everywhere.
    await waitFor(() => expect(screen.queryByTestId("sticky-size-pills")).not.toBeInTheDocument());
    const chosen = sizeButtons().filter((b) => b.getAttribute("aria-pressed") === "true");
    expect(chosen).toHaveLength(1);
    expect(chosen[0].textContent?.trim()).toBe(product.sizes[1]);
    const adds = screen.getAllByRole("button", { name: "Add to Bag" });
    expect(adds.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(adds[0]);
    await waitFor(() => expect(screen.getByLabelText("Items in bag")).toHaveTextContent("1"));
  });
});

describe("Buy box — one 'Size help' row (P1 #11)", () => {
  it("hides the three helpers behind one toggle and keeps their names once open", async () => {
    renderPanel();
    const toggle = await screen.findByTestId("size-help-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    // Collapsed: the helper panel is hidden from the accessibility tree.
    const panel = document.getElementById("purchase-size-help") as HTMLElement;
    expect(panel.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(panel.hidden).toBe(false);
    // Same three entry points as before — nothing lost, just grouped.
    expect(screen.getByRole("button", { name: /Size finder/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Size Guide" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ask the stylist" })).toBeInTheDocument();
  });
});
