import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import Home from "../page";
import { CartProvider } from "@/components/cart/cart-provider";

describe("Homepage", () => {
  it("renders the brand hero headline", () => {
    render(
      <CartProvider>
        <Home />
      </CartProvider>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: /made for everyday life/i }),
    ).toBeInTheDocument();
  });

  it("leads customers to the shop", () => {
    render(
      <CartProvider>
        <Home />
      </CartProvider>,
    );

    expect(
      screen.getByRole("link", { name: /explore collection/i }),
    ).toHaveAttribute("href", "/shop");
  });

  it("shows a featured section with product cards", () => {
    render(
      <CartProvider>
        <Home />
      </CartProvider>,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: /featured products/i }),
    ).toBeInTheDocument();
    // Featured catalog entries surface on the homepage.
    expect(screen.getAllByText(/heritage green panjabi/i).length).toBeGreaterThan(0);
  });
});
