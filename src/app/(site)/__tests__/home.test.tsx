import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import Home from "../page";
import { CartProvider } from "@/components/cart/cart-provider";

import { HOME_DEFAULTS, resetCms, saveCms } from "@/lib/home-cms";

afterEach(() => {
  cleanup();
  resetCms();
});

describe("Homepage", () => {
  it("renders the brand hero headline", () => {
    render(
      <CartProvider>
        <Home />
      </CartProvider>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /rooted in tradition.*made for today/i,
      }),
    ).toBeInTheDocument();
  });

  it("leads customers to the shop", () => {
    render(
      <CartProvider>
        <Home />
      </CartProvider>,
    );

    expect(screen.getByRole("link", { name: /^shop men$/i })).toHaveAttribute(
      "href",
      "/shop?category=men",
    );
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
    expect(
      screen.getAllByText(/heritage green panjabi/i).length,
    ).toBeGreaterThan(0);
  });
  it("retains CMS copy and section visibility in the editorial layout", () => {
    render(
      <CartProvider>
        <Home />
      </CartProvider>,
    );
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
      screen.queryByRole("heading", { name: "Find your everyday." }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Featured products" }),
    ).toBeInTheDocument();
  });

  it("links editorial calls to action to real shopping and service pages", () => {
    render(
      <CartProvider>
        <Home />
      </CartProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Explore the men's collection" }),
    ).toHaveAttribute("href", "/shop?category=men");
    expect(
      screen.getByRole("link", { name: "Discover what's new" }),
    ).toHaveAttribute("href", "/shop?filter=new");
    expect(
      screen.getByRole("link", { name: "Track your order" }),
    ).toHaveAttribute("href", "/track");
  });
  it("links mood and budget edits to working shop filters and respects CMS toggles", () => {
    render(
      <CartProvider>
        <Home />
      </CartProvider>,
    );
    expect(
      screen.getByRole("link", { name: "Explore Festive" }),
    ).toHaveAttribute("href", "/shop?mood=festive");
    expect(
      screen.getByRole("link", { name: "Shop the budget edit" }),
    ).toHaveAttribute("href", "/shop?price=under500");
    act(() =>
      saveCms({
        ...HOME_DEFAULTS,
        sections: {
          ...HOME_DEFAULTS.sections,
          shopByMood: false,
          budgetEdit: false,
        },
      }),
    );
    expect(
      screen.queryByRole("heading", { name: "Dress for your kind of day." }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Under ৳500" }),
    ).not.toBeInTheDocument();
  });
  it("shows the journal and labelled review preview, with independent CMS toggles", () => {
    render(
      <CartProvider>
        <Home />
      </CartProvider>,
    );
    expect(
      screen.getByRole("heading", { name: "The details make the everyday." }),
    ).toBeInTheDocument();
    expect(screen.getByText(/not verified customer proof/)).toBeInTheDocument();
    act(() =>
      saveCms({
        ...HOME_DEFAULTS,
        sections: {
          ...HOME_DEFAULTS.sections,
          customerStories: false,
          brandJournal: false,
        },
      }),
    );
    expect(
      screen.queryByRole("heading", { name: "Comfort, in their words." }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "The details make the everyday." }),
    ).not.toBeInTheDocument();
  });
});
