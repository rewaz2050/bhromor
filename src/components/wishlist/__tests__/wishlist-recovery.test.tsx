import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PRODUCTS, type Product } from "@/lib/catalog";
import { LanguageProvider } from "@/components/i18n/language-provider";
import WishlistView from "../wishlist-view";
const state = vi.hoisted(() => ({ ids: [] as string[], ready: true, busy: false, error: "", synced: true, toggle: vi.fn(), clear: vi.fn(), retry: vi.fn(), catalog: { products: [] as Product[], loading: false, live: true, retry: vi.fn() } }));
vi.mock("@/lib/use-wishlist", () => ({ useWishlist: () => state }));
vi.mock("@/lib/use-live-catalog", () => ({ useLiveCatalog: () => state.catalog }));
vi.mock("@/components/product/product-card", () => ({ GRID_CARD_SIZES: "100vw", default: ({ product }: { product: Product }) => <p>{product.name}</p> }));
vi.mock("@/components/info/info-rail", () => ({ default: () => null }));
vi.mock("@/components/promo/watch-strip", () => ({ default: () => null }));
vi.mock("@/components/home/product-rail", () => ({ default: () => null }));
beforeEach(() => {
  localStorage.clear(); document.cookie = "prosanti-lang=; Max-Age=0";
  window.history.replaceState(null, "", `/wishlist?ids=${PRODUCTS[0].id},${PRODUCTS[1].id}`);
  state.ids = []; state.ready = true; state.busy = false; state.error = "";
  state.catalog.products = PRODUCTS.slice(0, 2); state.catalog.loading = false; state.catalog.live = true;
  vi.resetAllMocks();
});
afterEach(() => cleanup());
const mount = () => render(<LanguageProvider initialLang="en"><WishlistView /></LanguageProvider>);

describe("wishlist recovery", () => {
  it("saves shared items sequentially so the account write lock cannot drop later items", async () => {
    let locked = false;
    state.toggle.mockImplementation(async (id: string) => {
      if (locked) return false;
      locked = true;
      await Promise.resolve();
      state.ids = [...state.ids, id];
      locked = false;
      return true;
    });
    mount();
    fireEvent.click(screen.getByTestId("save-shared"));
    await waitFor(() => expect(state.ids).toEqual([PRODUCTS[0].id, PRODUCTS[1].id]));
    expect(screen.getByTestId("save-shared")).toHaveTextContent("Saved —");
  });
});


describe("wishlist failure feedback", () => {
  it("does not announce success for a false result and retries only items not yet saved", async () => {
    let fail = true;
    state.toggle.mockImplementation(async (id: string) => {
      if (id === PRODUCTS[1].id && fail) return false;
      state.ids = [...state.ids, id]; return true;
    });
    mount();
    fireEvent.click(screen.getByTestId("save-shared"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Not all items could be saved"));
    expect(state.ids).toEqual([PRODUCTS[0].id]);
    expect(screen.getByTestId("save-shared")).not.toHaveTextContent("Saved —");
    fail = false;
    fireEvent.click(screen.getByTestId("save-shared"));
    await waitFor(() => expect(screen.getByTestId("save-shared")).toHaveTextContent("Saved —"));
    expect(state.toggle.mock.calls.map(call => call[0])).toEqual([PRODUCTS[0].id, PRODUCTS[1].id, PRODUCTS[1].id]);
    expect(state.ids).toEqual([PRODUCTS[0].id, PRODUCTS[1].id]);
  });
  it("catches a thrown save and prevents saving until the account is ready", async () => {
    state.toggle.mockRejectedValue(new Error("offline"));
    const view = mount();
    fireEvent.click(screen.getByTestId("save-shared"));
    await screen.findByRole("alert");
    state.ready = false; state.error = "internal sync error";
    view.rerender(<LanguageProvider initialLang="en"><WishlistView /></LanguageProvider>);
    expect(screen.getByTestId("save-shared")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry sync" }));
    expect(state.retry).toHaveBeenCalledOnce();
  });
  it("preserves clear confirmation and reports a failed clear without changing the list", async () => {
    window.history.replaceState(null, "", "/wishlist");
    state.ids = [PRODUCTS[0].id];
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    state.clear.mockResolvedValue(false);
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(state.clear).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not be cleared"));
    expect(state.ids).toEqual([PRODUCTS[0].id]);
    confirm.mockRestore();
  });
});

describe("wishlist catalog states", () => {
  it("does not call a saved list empty while catalog loading, and offers recovery on failure", () => {
    window.history.replaceState(null, "", "/wishlist");
    state.ids = [PRODUCTS[0].id]; state.catalog.products = []; state.catalog.loading = true;
    const view = mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading the products in this list");
    state.catalog.loading = false; state.catalog.live = false;
    view.rerender(<LanguageProvider initialLang="en"><WishlistView /></LanguageProvider>);
    expect(screen.getByRole("status")).toHaveTextContent("Your saved list is still here");
    fireEvent.click(screen.getByRole("button", { name: "Try loading products again" }));
    expect(state.catalog.retry).toHaveBeenCalledOnce();
    expect(state.ids).toEqual([PRODUCTS[0].id]);
  });
  it("distinguishes missing products from an empty list, retaining shared and own references", () => {
    state.catalog.products = [PRODUCTS[2]];
    mount();
    expect(screen.getByRole("heading", { name: "These items are not listed right now" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("This does not change your own wishlist");
    expect(state.clear).not.toHaveBeenCalled();
  });
  it("explains partially unavailable references while still showing available products", () => {
    state.catalog.products = [PRODUCTS[0]];
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Not currently listed: 1");
    expect(screen.getByText(PRODUCTS[0].name)).toBeInTheDocument();
    expect(state.toggle).not.toHaveBeenCalled();
  });
});


vi.mock("next/navigation", async (importOriginal) => ({
  ...await importOriginal<typeof import("next/navigation")>(),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));


it("reacts to query navigation rather than retaining the shared-list header", () => {
  const view = mount();
  expect(screen.getByTestId("wishlist-shared")).toBeInTheDocument();
  window.history.replaceState(null, "", "/wishlist");
  state.ids = [PRODUCTS[0].id];
  view.rerender(<LanguageProvider initialLang="en"><WishlistView /></LanguageProvider>);
  expect(screen.queryByTestId("wishlist-shared")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear all" })).toBeInTheDocument();
});
