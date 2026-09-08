import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
      </CartProvider>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: `Quick add ${product.name} to cart` }),
    );
    expect(screen.getByLabelText("Items in bag")).toHaveTextContent("1");
    expect(screen.getByText(`${product.name} added to cart`)).toHaveAttribute(
      "role",
      "status",
    );
    expect(
      screen.getByRole("button", { name: `Quick add ${product.name} to cart` }),
    ).toHaveTextContent("Added");
  });

  it("keeps the wishlist toggle accessible and reversible", () => {
    render(
      <CartProvider>
        <ProductCard product={product} />
      </CartProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Add to wishlist" }));
    const saved = screen.getByRole("button", { name: "Remove from wishlist" });
    expect(saved).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(saved);
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
