/**
 * UX plan §4 (R10) — the product information accordion: bilingual headings,
 * the first section open, care only when declared, and a fit block that
 * prints per-size availability instead of a generic chart.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ProductInfo from "@/components/product/product-info";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { PRODUCTS, type Product } from "@/lib/catalog";

const base = PRODUCTS.find((p) => p.sizes.length >= 3)!;
const product: Product = {
  ...base,
  details: [
    { label: "Fabric", value: "Cotton" },
    { label: "Care", value: "Cold wash" },
    { label: "Fit", value: "Regular" },
  ],
  sizeStock: Object.fromEntries(base.sizes.map((s, i) => [s, i === 0 ? 0 : 4])),
};

const mount = (p: Product, lang: "en" | "bn" = "bn") =>
  render(
    <LanguageProvider initialLang={lang}>
      <ProductInfo product={p} />
    </LanguageProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; max-age=0; path=/";
});
afterEach(cleanup);

describe("ProductInfo accordion", () => {
  it("opens the first section, names the others in Bengali and sorts the rows", () => {
    mount(product);
    expect(screen.getByTestId("info-details")).toHaveAttribute("open");
    expect(screen.getByTestId("info-fit")).not.toHaveAttribute("open");
    expect(screen.getByText("বিবরণ ও কাপড়")).toBeInTheDocument();
    expect(screen.getByText("যত্ন")).toBeInTheDocument();
    expect(screen.getByText("ফিট ও মাপ")).toBeInTheDocument();
    expect(screen.getByText("ডেলিভারি ও ফেরত")).toBeInTheDocument();
    expect(screen.getByTestId("info-care").textContent).toContain("Cold wash");
    expect(screen.getByTestId("info-fit").textContent).toContain("Regular");
    expect(screen.getByTestId("info-details").textContent).toContain("Cotton");
  });

  it("prints which sizes are here and which are gone", () => {
    mount(product, "en");
    const line = screen.getByTestId("info-sizes").textContent ?? "";
    expect(line).toContain(base.sizes.slice(1).join(" · "));
    expect(line).toContain(`${base.sizes[0]} sold out`);
  });

  it("skips the care section when the shop declared none", () => {
    mount({ ...product, details: [] });
    expect(screen.queryByTestId("info-care")).toBeNull();
  });
});
