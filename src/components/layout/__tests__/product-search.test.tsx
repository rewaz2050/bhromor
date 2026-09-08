import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import ProductSearch from "@/components/layout/product-search";
import { PRODUCTS } from "@/lib/catalog";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

function openSearch() {
  render(<ProductSearch />);
  const trigger = screen.getByRole("button", { name: "Search products" });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, input: screen.getByRole("searchbox") };
}

afterEach(cleanup);
beforeEach(() => push.mockClear());

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
