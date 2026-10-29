import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import QuickAdd from "../quick-add";
import { CartProvider } from "@/components/cart/cart-provider";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { CATEGORIES, PRODUCTS, type Product } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { CART_STORAGE_KEY } from "@/lib/cart";
const product: Product = { ...PRODUCTS[0], nameBn: "পরীক্ষার পাঞ্জাবি", sizes: ["XXL", "M", "L"], colors: ["Green", "Black"], inStock: true, sizeStock: { M: 0, L: 2, XXL: 8 } };
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
beforeEach(() => { localStorage.clear(); document.cookie = "prosanti-lang=; Max-Age=0"; vi.stubGlobal("fetch", vi.fn(async () => Response.json({}))); });
afterEach(() => { cleanup(); __resetLiveCatalog(); vi.unstubAllGlobals(); });
function mount(p = product, lang: "en" | "bn" = "en") {
  __serveLiveCatalogForTests([p], CATEGORIES);
  return render(<LanguageProvider initialLang={lang}><CartProvider><QuickAdd product={p} onClose={vi.fn()} /></CartProvider></LanguageProvider>);
}
describe("Quick Add purchase guidance", () => {
  it("explains the missing selection, preserves stock rules, and adds the selected variant/quantity", () => {
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Choose an available size");
    const add = screen.getByRole("button", { name: "Select a size to continue" });
    expect(add).toBeDisabled();
    expect(screen.getByRole("button", { name: "M — Sold out" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "L — 2 left" }));
    fireEvent.click(screen.getByRole("button", { name: "Black" }));
    fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    expect(screen.getByRole("status")).toHaveTextContent("Selected: L · Black");
    expect(within(screen.getByRole("group", { name: "Quantity" })).getByText("2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to Bag →" }));
    expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY)!)).toEqual([{ productId: product.id, variantLabel: "Black · L", qty: 2 }]);
  });
  it("explains when every listed size is unavailable, without enabling purchase", () => {
    mount({ ...product, sizeStock: { M: 0, L: 0, XXL: 0 } });
    expect(screen.getByRole("status")).toHaveTextContent("All listed sizes are currently sold out");
    expect(screen.getByTestId("quick-add-buy-now")).toBeDisabled();
    expect(screen.getByRole("link", { name: "View full details" })).toBeInTheDocument();
  });
  it("uses Bengali dialog, quantity, selection and navigation labels", () => {
    mount(product, "bn");
    expect(screen.getByRole("dialog", { name: "পরীক্ষার পাঞ্জাবি — পছন্দ নির্বাচন করুন" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "L — ২টি বাকি" }));
    expect(screen.getByRole("status")).toHaveTextContent("নির্বাচিত: L · Green");
    expect(within(screen.getByRole("group", { name: "পরিমাণ" })).getByText("১")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "পণ্যের পছন্দ নির্বাচন বন্ধ করুন" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "সম্পূর্ণ বিস্তারিত দেখুন" })).toBeInTheDocument();
  });
});
