import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PRODUCTS } from "@/lib/catalog";
import { __resetLiveCatalog } from "@/lib/live-catalog";
import { useLiveCatalog } from "@/lib/use-live-catalog";
import CatalogHydrator from "../catalog-hydrator";

/**
 * Audit 2026-09-17 P2.1 — a server page that already rendered the catalog
 * seeds the client registry, so sibling consumers go live without waiting
 * for (or issuing) a /api/products fetch.
 */

const liveProduct = { ...PRODUCTS[0], id: "uuid-live-1", price: 99900 };

function Consumer() {
  const { products, loading } = useLiveCatalog();
  return <p>{loading ? "loading" : `${products.length} live @ ${products[0]?.price}`}</p>;
}

afterEach(() => {
  cleanup();
  __resetLiveCatalog();
  vi.unstubAllGlobals();
});

describe("CatalogHydrator", () => {
  it("makes useLiveCatalog() consumers live from the SSR rows without a fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    render(
      <>
        {/* consumer mounted BEFORE the hydrator, like the header search */}
        <Consumer />
        <CatalogHydrator products={[liveProduct]} categories={[]} shops={[]} />
      </>,
    );
    expect(await screen.findByText("1 live @ 99900")).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("renders nothing and leaves an empty seed alone", () => {
    const { container } = render(<CatalogHydrator products={[]} />);
    expect(container.innerHTML).toBe("");
  });
});
