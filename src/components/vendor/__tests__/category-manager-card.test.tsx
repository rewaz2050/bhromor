import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({
  categories: [
    { id: "men", name: "Men", subCategories: ["Panjabi"] },
    { id: "women", name: "Women", subCategories: ["Three-piece"] },
  ],
  vendorCategories: [] as { id: string; categoryId: string; name: string }[],
  create: vi.fn(),
}));

vi.mock("@/components/vendor/vendor-shell", () => ({
  useVendor: () => ({ shopId: "shop-a" }),
}));
vi.mock("@/lib/use-vendor", () => ({
  useVendorCategories: () => ({
    categories: state.categories,
    vendorCategories: state.vendorCategories,
    loading: false,
    error: null,
    refresh: vi.fn(),
    createCategory: state.create,
  }),
  vendorErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : "Could not save.",
}));

import VendorCategoryManagerCard from "../category-manager-card";

beforeEach(() => {
  state.vendorCategories = [];
  state.create.mockReset();
});

describe("VendorCategoryManagerCard", () => {
  it("creates a shop-owned subcategory under a platform top-level category", async () => {
    state.create.mockResolvedValue({ id: "vc-1", categoryId: "men", name: "Eid Edit" });
    render(<VendorCategoryManagerCard />);

    fireEvent.change(screen.getByLabelText("Top-level category"), { target: { value: "men" } });
    fireEvent.change(screen.getByLabelText("Your subcategory"), { target: { value: "Eid Edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Add subcategory" }));

    await waitFor(() => expect(state.create).toHaveBeenCalledWith("men", "Eid Edit"));
    expect(await screen.findByRole("status")).toHaveTextContent("Eid Edit");
  });

  it("shows saved suggestions nested under their platform category", () => {
    state.vendorCategories = [{ id: "vc-1", categoryId: "men", name: "Eid Edit" }];
    render(<VendorCategoryManagerCard />);
    expect(screen.getByTestId("vendor-category-vc-1")).toHaveTextContent("Men · Eid Edit");
    expect(screen.getByLabelText("Top-level category")).toHaveTextContent("Men");
  });

  it("shows duplicate errors without clearing the vendor's entry", async () => {
    state.create.mockRejectedValue(new Error("That subcategory already exists in this category."));
    render(<VendorCategoryManagerCard />);
    fireEvent.change(screen.getByLabelText("Top-level category"), { target: { value: "men" } });
    fireEvent.change(screen.getByLabelText("Your subcategory"), { target: { value: "Eid Edit" } });
    fireEvent.click(screen.getByRole("button", { name: "Add subcategory" }));
    expect(await screen.findByRole("status")).toHaveTextContent("already exists");
    expect(screen.getByLabelText("Your subcategory")).toHaveValue("Eid Edit");
  });
});
