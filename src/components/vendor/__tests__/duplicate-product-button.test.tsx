/**
 * A3 — the Duplicate row action. What matters: the POST body is a DRAFT with
 * free slug/SKU, the seller lands in the new row's editor, and a failure is
 * spoken out loud instead of leaving a dead button.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import DuplicateProductButton from "@/components/vendor/duplicate-product-button";
import { PRODUCTS, type Product } from "@/lib/catalog";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

const product = (over: Partial<Product> = {}): Product => ({
  ...PRODUCTS[0],
  id: "p1",
  slug: "panjabi",
  sku: "PNJ",
  name: "Panjabi",
  status: "published",
  featured: true,
  unitsSold: 12,
  ...over,
});

const context = { slugs: ["panjabi", "panjabi-copy"], skus: ["PNJ"] };

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe("<DuplicateProductButton>", () => {
  it("posts a draft copy with the next free slug/SKU and opens it", async () => {
    const created = product({ id: "server-9", slug: "panjabi-copy-2", sku: "PNJ-C", name: "Panjabi (copy)" });
    const create = vi.fn(async (copy: Product) => {
      // The server mints the id; the body must still be a draft.
      expect(copy.status).toBe("draft");
      return created;
    });
    render(<DuplicateProductButton product={product()} context={context} create={create} />);

    fireEvent.click(screen.getByTestId("duplicate-product"));

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1));
    const body = create.mock.calls[0]![0];
    expect(body.status).toBe("draft");
    expect(body.name).toBe("Panjabi (copy)");
    expect(body.slug).toBe("panjabi-copy-2");
    expect(body.sku).toBe("PNJ-C");
    expect(body.unitsSold).toBeUndefined();
    expect(body.featured).toBe(false);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/vendor/products/server-9"));
  });

  it("shows the server's reason when the copy cannot be made", async () => {
    const create = vi.fn(async (copy: Product): Promise<Product> => {
      expect(copy.slug).toBe("panjabi-copy-2");
      throw new Error("Slug or SKU is already in use.");
    });
    render(<DuplicateProductButton product={product()} context={context} create={create} />);

    fireEvent.click(screen.getByTestId("duplicate-product"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/already in use/);
    expect(push).not.toHaveBeenCalled();
    // The button must come back to life so the seller can retry.
    await waitFor(() => expect(screen.getByTestId("duplicate-product")).not.toBeDisabled());
  });
});
