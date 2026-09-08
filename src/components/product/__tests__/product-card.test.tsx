import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import BagDrawer from "@/components/cart/bag-drawer";
import ProductCard from "@/components/product/product-card";
import { CartProvider, useCart } from "@/components/cart/cart-provider";
import { PRODUCTS } from "@/lib/catalog";
import { clearWishlistStore } from "@/lib/wishlist-store";

const product = PRODUCTS.find((item) => item.inStock)!;

function CartCount() {
  const { itemCount } = useCart();
  return <output aria-label="Items in bag">{itemCount}</output>;
}

beforeEach(() => {
  localStorage.clear();
  clearWishlistStore();
});
afterEach(cleanup);

describe("Editorial product cards", () => {
  it("adds to the real cart and announces success", () => {
    render(
      <CartProvider>
        <ProductCard product={product} />
        <CartCount />
        <BagDrawer />
      </CartProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Quick add ${product.name} to cart` }),
    );
    expect(screen.getByLabelText("Items in bag")).toHaveTextContent("0");
    expect(
      screen.getByRole("button", { name: "Select a size to continue" }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: product.sizes[1] }));
    fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to Bag →" }));
    expect(screen.getByLabelText("Items in bag")).toHaveTextContent("2");
    expect(
      screen.getByRole("dialog", { name: "Your Bag" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`${product.colors[0]} · ${product.sizes[1]}`),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: `Remove ${product.name}` }),
    );
    expect(screen.getByText("Your bag is empty.")).toBeInTheDocument();
  });

  it("keeps the wishlist toggle accessible and reversible", async () => {
    render(
      <CartProvider>
        <ProductCard product={product} />
      </CartProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to wishlist" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Added to wishlist"),
    );
    const saved = screen.getByRole("button", { name: "Remove from wishlist" });
    expect(saved).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(saved);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Removed from wishlist",
      ),
    );
    expect(
      screen.getByRole("button", { name: "Add to wishlist" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("never offers quick-add for sold-out products", () => {
    render(
      <CartProvider>
        <ProductCard product={{ ...product, inStock: false }} />
      </CartProvider>,
    );
    expect(screen.getByText("Sold out")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Quick add/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("link")[0]).toHaveAttribute(
      "href",
      `/product/${product.slug}`,
    );
  });
});
