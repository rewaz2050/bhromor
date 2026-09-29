/**
 * 2026-09-27 — the editor must show WHY a save failed, and Cancel must stay
 * inside the vendor's own dashboard.
 *
 * The save sink (useCatalog / useVendorProducts) throws the API's message.
 * Before this round a failure wrote the *previous* render's `saveError` into
 * the banner, so every failure — a slug clash, a duplicate variant SKU, a
 * missing migration — surfaced as the generic "Could not save the product."
 * with no way for the shop to fix it.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ProductEditor from "../product-editor";
import { PRODUCTS, type Product } from "@/lib/catalog";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/use-catalog", () => ({
  useCatalog: () => ({ products: [], error: null, saveProduct: vi.fn(), clearError: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

const base = PRODUCTS.find((p) => p.sizes.length >= 3 && p.media.length > 0)!;
const categories = [{ id: base.category, name: base.category, subCategories: [base.subCategory] }];
const product: Product = { ...base, id: "11111111-1111-4111-8111-111111111111" };

describe("ProductEditor — failure reporting", () => {
  it("shows the API's own message on the first failed save", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("এই লিংক (slug) অন্য দোকানের প্রোডাক্টে ব্যবহৃত — একটু আলাদা শব্দ দিন।");
    });
    render(
      <ProductEditor
        product={product}
        categoriesList={categories}
        products={[product]}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(/অন্য দোকানের প্রোডাক্টে ব্যবহৃত/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Could not save the product.")).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("still saves and navigates when the sink resolves", async () => {
    const onSave = vi.fn(async () => true);
    render(
      <ProductEditor
        product={product}
        categoriesList={categories}
        products={[product]}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/products"));
  });
});

describe("ProductEditor — draft without a photo (B8)", () => {
  const noPhoto: Product = { ...product, media: [], status: "draft" };

  it("lets a draft save with no media at all", async () => {
    const onSave = vi.fn(async () => true);
    render(
      <ProductEditor
        product={noPhoto}
        categoriesList={categories}
        products={[noPhoto]}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
  });

  it("still refuses to PUBLISH a photo-less row", async () => {
    const onSave = vi.fn(async () => true);
    render(
      <ProductEditor
        product={noPhoto}
        categoriesList={categories}
        products={[noPhoto]}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Published" }));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(onSave).not.toHaveBeenCalled());
    expect(await screen.findByText(/Add at least one product image/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("ProductEditor — Cancel target", () => {
  it("returns the vendor to its own product list, not the admin one", () => {
    render(
      <ProductEditor
        product={product}
        categoriesList={categories}
        products={[product]}
        onSave={vi.fn(async () => true)}
        redirectTo="/vendor/products"
        cancelTo="/vendor/products"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(push).toHaveBeenCalledWith("/vendor/products");
  });
});
