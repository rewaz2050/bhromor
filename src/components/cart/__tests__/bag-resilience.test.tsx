import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import BagDrawer from "../bag-drawer";
import { CartProvider, useCart } from "../cart-provider";
import { CART_STORAGE_KEY } from "@/lib/cart";
import { __resetLiveCatalog, __serveLiveCatalogForTests, ensureLiveCatalog } from "@/lib/live-catalog";
import { CATEGORIES, PRODUCTS } from "@/lib/catalog";
import * as merchandising from "@/lib/merchandising";
const stored = [{ productId: PRODUCTS[0].id, variantLabel: "L", qty: 1 }];
function OpenBag() { const { openBag } = useCart(); return <button onClick={openBag}>Open test bag</button>; }
const mount = () => render(<CartProvider><OpenBag /><BagDrawer /></CartProvider>);
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(stored));
  __resetLiveCatalog();
});
afterEach(() => { cleanup(); __resetLiveCatalog(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("Saved bag resilience", () => {
  it("retains stored lines when mount effects are replayed in StrictMode", async () => {
    __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
    render(<StrictMode><CartProvider><OpenBag /><BagDrawer /></CartProvider></StrictMode>);
    await waitFor(() => expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(JSON.stringify(stored)));
    fireEvent.click(screen.getByRole("button", { name: "Open test bag" }));
    await screen.findByTestId("bag-checkout");
  });
  it("does not call an unresolved saved bag empty while catalog loading is pending", async () => {
    let finish = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(resolve => { finish = () => resolve(Response.json({}, { status: 503 })); })));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Open test bag" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Loading your saved bag…");
    expect(screen.queryByText("Your bag is empty.")).not.toBeInTheDocument();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(JSON.stringify(stored));
    await act(async () => { finish(); await ensureLiveCatalog(); });
  });

  it("keeps saved lines through an outage and recovers their current catalog data", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async url => {
      if (String(url) === "/api/products") {
        calls++;
        return calls === 1 ? Response.json({}, { status: 503 }) : Response.json({ source: "live", products: PRODUCTS, categories: CATEGORIES, shops: [] });
      }
      return Response.json({});
    }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Open test bag" }));
    await screen.findByText(/Your saved bag is still on this device/);
    expect(screen.queryByText("Your bag is empty.")).not.toBeInTheDocument();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(JSON.stringify(stored));
    fireEvent.click(screen.getByRole("button", { name: "Try loading products again" }));
    await waitFor(() => expect(screen.getByTestId("bag-checkout")).toBeInTheDocument());
    expect(screen.getByText(PRODUCTS[0].name)).toBeInTheDocument();
    expect(calls).toBe(2);
    expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(JSON.stringify(stored));
  });

  it("does no recommendation work until the bag is opened", async () => {
    __serveLiveCatalogForTests(PRODUCTS, CATEGORIES);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
    const recommendations = vi.spyOn(merchandising, "completeTheLook");
    mount();
    await waitFor(() => expect(localStorage.getItem(CART_STORAGE_KEY)).toBe(JSON.stringify(stored)));
    expect(recommendations).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open test bag" }));
    await screen.findByTestId("bag-checkout");
    expect(recommendations).toHaveBeenCalled();
  });
});
