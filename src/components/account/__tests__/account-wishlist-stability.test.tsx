/**
 * Menubar redesign (2026-09-26) — found while running the browser suite:
 * the storefront remounted wholesale about a second after load, the moment
 * the customer-session probe answered, because AccountWishlistProvider
 * switched wrapper element types. A search dialog opened in that second
 * vanished; typed text was dropped; entrance animations replayed.
 *
 * The provider must keep one element at that position and only change the
 * context value.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AccountWishlistProvider } from "@/components/account/account-wishlist-provider";
import { useWishlist } from "@/lib/use-wishlist";
import { clearWishlistStore, toggleWishlistStore } from "@/lib/wishlist-store";

vi.mock("@/lib/use-live-catalog", () => ({
  useLiveCatalog: () => ({ products: [], categories: [], shops: [], live: false, loading: false }),
}));

function Consumer() {
  const wishlist = useWishlist();
  return (
    <>
      <input aria-label="Search" />
      <output>{`${wishlist.synced ? "cloud" : "device"}:${wishlist.count}:${wishlist.ready}`}</output>
    </>
  );
}

const tree = (authLoading: boolean) => (
  <AccountWishlistProvider client={null} userId={null} authLoading={authLoading}>
    <Consumer />
  </AccountWishlistProvider>
);

afterEach(() => {
  cleanup();
  clearWishlistStore();
});

describe("AccountWishlistProvider — stable tree across the session probe", () => {
  it("keeps the same child DOM (and its state) when authLoading flips", () => {
    const { rerender } = render(tree(true));
    const input = screen.getByRole("textbox", { name: "Search" });
    fireEvent.change(input, { target: { value: "gamcha" } });

    rerender(tree(false));

    expect(screen.getByRole("textbox", { name: "Search" })).toBe(input);
    expect(input).toHaveValue("gamcha");
  });

  it("serves the device wishlist right away when there is no cloud client", () => {
    toggleWishlistStore("heritage-green-panjabi");
    render(tree(true));
    // Nothing to wait for without a client: no blank-then-jump for the count.
    expect(screen.getByRole("status")).toHaveTextContent("device:1:true");
  });
});
