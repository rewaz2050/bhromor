import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import Home from "../page";
import { CartProvider } from "@/components/cart/cart-provider";
import { HOME_DEFAULTS, resetCms, saveCms } from "@/lib/home-cms";

afterEach(() => {
  cleanup();
  resetCms();
});

function renderHome() {
  return render(
    <CartProvider>
      <Home />
    </CartProvider>,
  );
}

describe("Homepage editorial journey", () => {
  it("renders the premium campaign headline and one collection CTA", () => {
    renderHome();

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /rooted in tradition.*made for today/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /explore collection/i }),
    ).toHaveAttribute("href", "/shop");
    expect(screen.queryByRole("link", { name: /shop men/i })).toBeNull();
  });

  it("shows collections and a restrained best-seller edit", () => {
    renderHome();

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "A wardrobe, thoughtfully composed.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Best sellers." }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Heritage Green Panjabi" }),
    ).toHaveAttribute("href", "/product/heritage-green-panjabi");
  });

  it("keeps the homepage short and contains no launch-unsafe review proof", () => {
    renderHome();

    expect(screen.queryByText(/demo review/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: /new arrivals/i })).toBeNull();
    expect(screen.queryByRole("heading", { name: /under ৳500/i })).toBeNull();
    expect(
      screen.queryByRole("heading", { name: /dress for your kind of day/i }),
    ).toBeNull();
    expect(screen.queryByRole("heading", { name: /customer reviews/i })).toBeNull();
  });

  it("follows hero → collections → best sellers → story → trust → journal", () => {
    const { container } = renderHome();
    const selectors = [
      ".cinematic-hero",
      "#collections",
      "#best-sellers",
      "#story",
      '[aria-label="PROSANTI service promises"]',
      "#journal",
    ];
    const positions = selectors.map((selector) => {
      const node = container.querySelector(selector);
      expect(node).not.toBeNull();
      return Array.from(container.querySelectorAll("section")).indexOf(
        node as HTMLElement,
      );
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("retains CMS hero copy and visibility controls in the shorter layout", () => {
    renderHome();
    act(() =>
      saveCms({
        ...HOME_DEFAULTS,
        hero: {
          ...HOME_DEFAULTS.hero,
          title1: "Thoughtfully made",
          title2: "for you.",
        },
        sections: { ...HOME_DEFAULTS.sections, collections: false },
      }),
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Thoughtfully made for you.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: "A wardrobe, thoughtfully composed.",
      }),
    ).toBeNull();
    expect(screen.getByRole("heading", { name: "Best sellers." })).toBeVisible();
  });

  it("links the philosophy, service promises and visual journal to real pages", () => {
    renderHome();

    expect(screen.getByRole("link", { name: "Read our story" })).toHaveAttribute(
      "href",
      "/about",
    );
    expect(screen.getByRole("link", { name: "Easy Returns" })).toHaveAttribute(
      "href",
      "/returns",
    );
    expect(
      screen.getByRole("heading", { name: "Stories in cloth and light." }),
    ).toBeInTheDocument();
  });
});
