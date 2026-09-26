import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import ProductSearch from "@/components/layout/product-search";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { PRODUCTS } from "@/lib/catalog";
import { RECENT_SEARCHES_KEY } from "@/lib/recent-searches";
import { __resetSupportContactForTests } from "@/lib/use-support-contact";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
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

function openSearch() {
  render(<ProductSearch />);
  const trigger = screen.getByRole("button", { name: "Search products" });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, input: screen.getByRole("searchbox") };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
beforeEach(() => {
  push.mockClear();
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  __resetSupportContactForTests();
});

describe("Header product search", () => {
  it("focuses the input, previews matching products, and restores focus on Escape", async () => {
    const { trigger, input } = openSearch();
    await waitFor(() => expect(input).toHaveFocus());
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.change(input, { target: { value: PRODUCTS[0].sku } });
    expect(screen.getByRole("status")).toHaveTextContent("1 match");
    expect(
      screen.getByRole("link", { name: new RegExp(PRODUCTS[0].name) }),
    ).toHaveAttribute("href", `/product/${PRODUCTS[0].slug}`);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("does not steal focus when live results rerender the drawer", async () => {
    const { input } = openSearch();
    await waitFor(() => expect(input).toHaveFocus());
    const submit = screen.getByRole("button", { name: "View search results" });
    submit.focus();
    fireEvent.change(input, { target: { value: "panjabi" } });
    // A changing onClose callback previously restarted the drawer focus effect.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(submit).toHaveFocus();
  });

  it("submits a trimmed, safely encoded query to the shop", () => {
    const { input } = openSearch();
    fireEvent.change(input, { target: { value: "  শার্ট & cotton  " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenCalledWith(
      `/shop?${new URLSearchParams({ q: "শার্ট & cotton" })}`,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("offers recovery for no matches and collection links for a blank query", () => {
    const { input } = openSearch();
    expect(screen.getByRole("link", { name: "Men" })).toHaveAttribute(
      "href",
      "/shop?category=men",
    );
    fireEvent.change(input, { target: { value: "nothing-matches-this" } });
    expect(screen.getByText("No matches just yet")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Browse all products" }),
    ).toHaveAttribute("href", "/shop");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenCalledWith("/shop");
  });

  it("links to the full set of results and closes on product selection", () => {
    const { input } = openSearch();
    fireEvent.change(input, { target: { value: PRODUCTS[0].sku } });
    expect(screen.getByRole("link", { name: "View 1 result" })).toHaveAttribute(
      "href",
      `/shop?q=${PRODUCTS[0].sku}`,
    );
    const productLink = screen.getByRole("link", {
      name: new RegExp(PRODUCTS[0].name),
    });
    productLink.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
    fireEvent.click(productLink);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

/* UX plan §1.2 (R6) — recent searches, Bengali chips, a next step at zero results */
describe("Header product search — R6", () => {
  it("remembers a submitted query on this device and offers it back as a chip", () => {
    const { input } = openSearch();
    expect(screen.queryByTestId("recent-searches")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "  lungi " } });
    fireEvent.submit(screen.getByRole("search"));
    expect(JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY)!)).toEqual(["lungi"]);
    cleanup();
    const second = openSearch();
    const recent = screen.getByTestId("recent-searches");
    fireEvent.click(within(recent).getByRole("button", { name: "lungi" }));
    expect(second.input).toHaveValue("lungi");
    expect(screen.getByRole("status")).toHaveTextContent(/match/);
    fireEvent.change(second.input, { target: { value: "" } });
    fireEvent.click(within(screen.getByTestId("recent-searches")).getByRole("button", { name: "Clear" }));
    expect(screen.queryByTestId("recent-searches")).not.toBeInTheDocument();
    expect(localStorage.getItem(RECENT_SEARCHES_KEY)).toBeNull();
  });

  it("quick chips read in Bengali and still find the English-named product", () => {
    render(
      <LanguageProvider initialLang="bn">
        <ProductSearch />
      </LanguageProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "পণ্য অনুসন্ধান" }));
    fireEvent.click(screen.getByRole("button", { name: "পাঞ্জাবি" }));
    expect(screen.getByRole("searchbox")).toHaveValue("পাঞ্জাবি");
    const panjabi = PRODUCTS.find((p) => p.subCategory === "Panjabi")!;
    expect(screen.getByRole("link", { name: new RegExp(panjabi.name) })).toHaveAttribute(
      "href",
      `/product/${panjabi.slug}`,
    );
  });

  it("at zero results offers WhatsApp (when a number is configured) and what is popular now", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ whatsapp: "01712345678" }), { status: 200 }))),
    );
    const { input } = openSearch();
    fireEvent.change(input, { target: { value: "nothing-matches-this" } });
    const ask = await screen.findByTestId("search-ask-whatsapp");
    expect(ask.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/8801712345678\?text=/);
    expect(decodeURIComponent(ask.getAttribute("href")!)).toContain("nothing-matches-this");
    const popular = screen.getByTestId("search-popular");
    const links = within(popular).getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(3);
    expect(links[0]).toHaveAttribute("href", expect.stringMatching(/^\/product\//));
  });
});
