/**
 * UX plan §4 (R10) — the shared product editor (admin + vendor) can set
 * stock per size: the grid is prefilled from the live counts, the total
 * becomes their sum, and the save payload carries `sizeStock`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProductEditor from "../product-editor";
import { PRODUCTS, type Product } from "@/lib/catalog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/use-catalog", () => ({
  useCatalog: () => ({ products: [], error: null, saveProduct: vi.fn(), clearError: vi.fn() }),
}));

afterEach(() => cleanup());

const base = PRODUCTS.find((p) => p.sizes.length >= 3)!;
const categories = [{ id: base.category, name: base.category, subCategories: [base.subCategory] }];

describe("ProductEditor — per-size stock", () => {
  it("prefills the per-size grid, sums the total and sends sizeStock on save", async () => {
    const [a, b, c] = base.sizes;
    const product: Product = {
      ...base,
      id: "11111111-1111-4111-8111-111111111111",
      stock: 7,
      sizeStock: { [a]: 0, [b]: 2, [c]: 5 },
    };
    const onSave = vi.fn<(p: Product, isNew: boolean) => Promise<boolean>>(async () => true);
    render(
      <ProductEditor product={product} categoriesList={categories} products={[product]} onSave={onSave} />,
    );
    const toggle = screen.getByRole("checkbox", { name: /Set stock per size/ });
    expect(toggle).toBeChecked();
    expect(screen.getByLabelText(`Stock for size ${a}`)).toHaveValue(0);
    expect(screen.getByLabelText(`Stock for size ${c}`)).toHaveValue(5);

    fireEvent.change(screen.getByLabelText(`Stock for size ${a}`), { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    // Every size in the grid is sent — a size left blank is 0 (sold out).
    expect(saved.sizeStock).toEqual(
      Object.fromEntries(base.sizes.map((s) => [s, s === a ? 4 : s === b ? 2 : s === c ? 5 : 0])),
    );
    expect(saved.stock).toBe(11);
    expect(saved.inStock).toBe(true);
  });

  it("turning the toggle on seeds the grid from the total; off sends no sizeStock", async () => {
    const product: Product = { ...base, id: "11111111-1111-4111-8111-111111111112", stock: 7, sizeStock: undefined };
    const onSave = vi.fn<(p: Product, isNew: boolean) => Promise<boolean>>(async () => true);
    render(
      <ProductEditor product={product} categoriesList={categories} products={[product]} onSave={onSave} />,
    );
    const toggle = screen.getByRole("checkbox", { name: /Set stock per size/ });
    expect(toggle).not.toBeChecked();
    fireEvent.click(toggle);
    const inputs = base.sizes.map((s) => screen.getByLabelText(`Stock for size ${s}`) as HTMLInputElement);
    expect(inputs.reduce((sum, i) => sum + Number(i.value), 0)).toBe(7);
    fireEvent.click(toggle); // back off
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const saved = onSave.mock.calls[0][0];
    expect(saved.sizeStock).toBeUndefined();
    expect(saved.stock).toBe(7);
  });
});
