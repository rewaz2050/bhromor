import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import ProductSearch from "../product-search";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { PRODUCTS, CATEGORIES, type Product } from "@/lib/catalog";

const state = vi.hoisted(() => ({ products: [] as Product[], loading: false }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/use-live-catalog", () => ({ useLiveCatalog: () => ({ ...state, categories: CATEGORIES, shops: [] }) }));
vi.mock("@/lib/use-support-contact", () => ({ useSupportWhatsApp: () => null }));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
beforeEach(() => { localStorage.clear(); state.products = [PRODUCTS[0]]; state.loading = false; });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const open = () => fireEvent.click(screen.getByRole("button", { name: "Search products" }));

describe("Search — honest catalog states", () => {
  it("distinguishes loading from zero matches, then updates without losing the query", () => {
    state.products = []; state.loading = true;
    const { rerender } = render(<ProductSearch />);
    open();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: PRODUCTS[0].sku } });
    expect(screen.getByRole("status")).toHaveTextContent("Loading products…");
    expect(screen.queryByText("No matches just yet")).not.toBeInTheDocument();
    state.products = [PRODUCTS[0]]; state.loading = false;
    rerender(<ProductSearch />);
    expect(screen.getByRole("searchbox")).toHaveValue(PRODUCTS[0].sku);
    expect(screen.getByRole("status")).toHaveTextContent("1 match");
  });
  it("has a useful no-catalog state instead of pretending the query has zero matches", () => {
    state.products = [];
    render(<ProductSearch />); open();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "panjabi" } });
    expect(screen.getByRole("status")).toHaveTextContent("No products to show right now");
    expect(screen.getByRole("link", { name: "Contact support" })).toHaveAttribute("href", "/contact");
    expect(screen.queryByText("No matches just yet")).not.toBeInTheDocument();
  });
  it("does not promote empty categories or unsupported quick terms", () => {
    render(<ProductSearch />); open();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Men" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("link", { name: "Women" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Gamcha" })).not.toBeInTheDocument();
  });
  it("gives Bengali controls clear names and returns focus to the cleared input", () => {
    render(<LanguageProvider initialLang="bn"><ProductSearch /></LanguageProvider>);
    fireEvent.click(screen.getByRole("button", { name: "পণ্য অনুসন্ধান" }));
    const input = screen.getByRole("searchbox", { name: "নাম, ধরন বা পণ্য কোড দিয়ে খুঁজুন" });
    fireEvent.change(input, { target: { value: "panjabi" } });
    expect(screen.getByRole("button", { name: "অনুসন্ধানের ফল দেখুন" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "অনুসন্ধান বন্ধ করুন" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "অনুসন্ধান মুছুন" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });
});
