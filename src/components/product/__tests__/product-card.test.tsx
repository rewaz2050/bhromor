import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
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
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import { __resetLiveCatalog, __serveLiveCatalogForTests } from "@/lib/live-catalog";
import { clearWishlistStore } from "@/lib/wishlist-store";
import { LanguageProvider } from "@/components/i18n/language-provider";

vi.mock("@/lib/use-live-catalog", async () => {
  const { CATEGORIES, PRODUCTS } = await import("@/lib/catalog");
  return {
    useLiveCatalog: () => ({
      products: PRODUCTS,
      categories: CATEGORIES,
      shops: [],
      live: false,
      loading: false,
      liveCategories: CATEGORIES,
    }),
  };
});

const product = PRODUCTS.find((item) => item.inStock)!;

function CartCount() {
  const { itemCount } = useCart();
  return <output aria-label="Items in bag">{itemCount}</output>;
}

beforeEach(() => {
  localStorage.clear();
  clearWishlistStore();
  // cart + bag resolve through the live registry — serve the rows there too
  __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
});
afterEach(() => __resetLiveCatalog());
afterEach(cleanup);

describe("Editorial product cards", () => {
  it("keeps the visible hierarchy quiet until shopping actions are needed", () => {
    render(
      <CartProvider>
        <ProductCard product={product} />
      </CartProvider>,
    );
    expect(screen.getByRole("heading", { name: product.name })).toBeVisible();
    expect(screen.getByText("Heritage Green")).toBeVisible();
    expect(screen.getByText("Panjabi")).toBeVisible();
    expect(
      screen.getByRole("link", { name: `View details for ${product.name}` }),
    ).toHaveAttribute("href", `/product/${product.slug}`);
    expect(screen.queryByText(/^New$/)).toBeNull();
    expect(screen.queryByText(`(${product.reviewCount})`)).toBeNull();
  });

  it("shows the Bangla name under the title, and Bangla-first in Bangla", () => {
    const withBn = { ...product, nameBn: "হেরিটেজ সবুজ পাঞ্জাবি" };
    render(
      <CartProvider>
        <ProductCard product={withBn} />
      </CartProvider>,
    );
    // English: the style name stays the heading; Bangla sits quietly under it.
    expect(screen.getByRole("heading", { name: product.name })).toBeVisible();
    const alt = screen.getByTestId("product-card-alt-name");
    expect(alt).toHaveTextContent("হেরিটেজ সবুজ পাঞ্জাবি");
    expect(alt).toHaveAttribute("lang", "bn");

    cleanup();
    render(
      <LanguageProvider initialLang="bn">
        <CartProvider>
          <ProductCard product={withBn} />
        </CartProvider>
      </LanguageProvider>,
    );
    // Bangla: the Bangla name is the heading, English becomes the second line.
    expect(
      screen.getByRole("heading", { name: "হেরিটেজ সবুজ পাঞ্জাবি" }),
    ).toBeVisible();
    expect(screen.getByTestId("product-card-alt-name")).toHaveTextContent(
      "Heritage Green",
    );

    cleanup();
    render(
      <CartProvider>
        <ProductCard product={{ ...product, nameBn: undefined }} />
      </CartProvider>,
    );
    // No Bangla name on the row → no second line, nothing invented.
    expect(screen.queryByTestId("product-card-alt-name")).toBeNull();
  });

  it("shows a ▶ Video cue only when the piece has a video", () => {
    render(
      <CartProvider>
        <ProductCard product={{ ...product, video: undefined, media: product.media.filter((m) => m.kind !== "video") }} />
      </CartProvider>,
    );
    expect(screen.queryByTestId("video-badge")).toBeNull();
    cleanup();
    render(
      <CartProvider>
        <ProductCard product={{ ...product, video: { youtubeId: "dQw4w9WgXcQ", label: "Watch" } }} />
      </CartProvider>,
    );
    expect(screen.getByTestId("video-badge")).toHaveTextContent(/video/i);
  });

  it("shows a sold count only when real units were sold (P2 #1)", () => {
    // No sales figure → no line; the card never invents a ranking.
    render(
      <CartProvider>
        <ProductCard product={product} />
      </CartProvider>,
    );
    expect(screen.queryByText(/sold/i)).toBeNull();

    cleanup();
    render(
      <CartProvider>
        <ProductCard product={{ ...product, unitsSold: 23 }} />
      </CartProvider>,
    );
    expect(screen.getByText("23 sold")).toBeVisible();
  });

  it("shows the Quality Checked chip only when the shop ticked it (P2 #21)", () => {
    // No declaration → no chip; the badge is never assumed for a product.
    render(
      <CartProvider>
        <ProductCard product={product} />
      </CartProvider>,
    );
    expect(screen.queryByText(/quality checked/i)).toBeNull();

    cleanup();
    render(
      <CartProvider>
        <ProductCard product={{ ...product, qualityChecked: true }} />
      </CartProvider>,
    );
    expect(screen.getByText("Quality checked")).toBeVisible();
  });

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
