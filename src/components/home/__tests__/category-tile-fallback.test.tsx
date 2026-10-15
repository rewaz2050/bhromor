/**
 * Category tiles without a photo (live categories can ship an empty `image`)
 * show the label's first letter on a tinted tile instead of a blank box.
 */
import { describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { categoryInitial } from "@/lib/home-shelves";
import CategoryRow from "@/components/home/category-row";
import { LanguageProvider } from "@/components/i18n/language-provider";

const noPhotos = CATEGORIES.map((c) => ({ ...c, image: "" }));

describe("categoryInitial", () => {
  it("takes the first whole character of the label, per language", () => {
    const cat = CATEGORIES[0];
    expect(categoryInitial({ ...cat, name: "Men", nameBn: "পুরুষ" }, "en")).toBe("M");
    expect(categoryInitial({ ...cat, name: "Men", nameBn: "পুরুষ" }, "bn")).toBe("প");
    expect(categoryInitial({ ...cat, name: "  Gamcha", nameBn: "" }, "bn")).toBe("G");
  });
});

describe("CategoryRow — photo-less tiles", () => {
  it("renders a letter tile, not an image, when a category has no photo", () => {
    cleanup();
    const { getAllByTestId } = render(
      <LanguageProvider>
        <CategoryRow pool={PRODUCTS} categories={noPhotos} />
      </LanguageProvider>,
    );
    const tiles = getAllByTestId("category-tile");
    expect(tiles.length).toBeGreaterThan(0);
    for (const tile of tiles) {
      expect(tile.querySelector("img")).toBeNull();
      const mark = tile.querySelector('[aria-hidden="true"].font-display');
      expect(mark?.textContent?.length ?? 0).toBeGreaterThan(0);
      const id = tile.getAttribute("data-category");
      const cat = noPhotos.find((c) => c.id === id)!;
      expect(tile.textContent).toContain(cat.name);
    }
  });
});
