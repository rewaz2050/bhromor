/**
 * A4 — the bulk bar. What matters to the seller: see the diff before saving,
 * be told about rows that are left alone, and get an honest partial-failure
 * line instead of a green tick over a half-applied change.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import BulkEditBar from "@/components/vendor/bulk-edit-bar";
import { PRODUCTS, type Product } from "@/lib/catalog";

const row = (over: Partial<Product> = {}): Product => ({
  ...PRODUCTS[0],
  id: "p1",
  name: "Panjabi",
  price: 120_000,
  stock: 12,
  inStock: true,
  sizeStock: undefined,
  ...over,
});

afterEach(cleanup);

describe("<BulkEditBar>", () => {
  it("shows the diff and saves nothing until Apply is pressed", async () => {
    const apply = vi.fn(async () => true);
    render(<BulkEditBar products={[row()]} onApply={apply} />);

    fireEvent.click(screen.getByLabelText(/Price/));
    expect(screen.getByText("Will change 1 product")).toBeInTheDocument();
    expect(screen.getByText("৳1,200 → ৳1,080")).toBeInTheDocument();
    expect(apply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("bulk-apply"));
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("status").textContent).toContain("Saved 1 product.");
  });

  it("reports a partial failure by name instead of claiming success", async () => {
    const apply = vi.fn(async (p: Product) => {
      if (p.id === "p2") throw new Error("PATCH failed");
      return true;
    });
    render(
      <BulkEditBar
        products={[row(), row({ id: "p2", name: "Shirt", price: 80_000 })]}
        onApply={apply}
      />,
    );

    fireEvent.click(screen.getByLabelText(/Stock/));
    fireEvent.click(screen.getByTestId("bulk-apply"));

    await waitFor(() => expect(screen.getByRole("status")).toBeInTheDocument());
    expect(screen.getByRole("status").textContent).toContain("Saved 1 · 1 failed");
    expect(screen.getByRole("status").textContent).toContain("Shirt");
  });

  it("says which rows a total-stock edit leaves alone, and why", () => {
    render(
      <BulkEditBar
        products={[row({ id: "sized", name: "Sized panjabi", sizeStock: { M: 2, L: 0 } })]}
        onApply={vi.fn(async () => true)}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Stock/));
    expect(screen.getByText("Nothing would change.")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-skipped").textContent).toMatch(/per-size stock/);
  });

  it("marks sold out across a size grid", async () => {
    const apply = vi.fn(async (p: Product) => {
      expect(p.inStock).toBe(false);
      return true;
    });
    render(
      <BulkEditBar
        products={[row({ sizeStock: { M: 3, L: 2 } })]}
        onApply={apply}
      />,
    );
    fireEvent.click(screen.getByLabelText(/Stock/));
    fireEvent.change(screen.getByLabelText("Stock change kind"), { target: { value: "soldOut" } });
    expect(screen.getByText("5 → 0 in stock")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("bulk-apply"));
    await waitFor(() => expect(apply).toHaveBeenCalledTimes(1));
    expect(apply.mock.calls[0]![0].sizeStock).toEqual({ M: 0, L: 0 });
  });
});
