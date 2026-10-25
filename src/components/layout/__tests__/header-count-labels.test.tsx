import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
import CartButton from "../cart-button";
import WishlistButton from "../wishlist-button";
const state = vi.hoisted(() => ({ itemCount: 2, ready: true, lines: [{ productId: "one" }], detail: [{}], openBag: vi.fn(), count: 3 }));
vi.mock("@/components/cart/cart-provider", () => ({ useCart: () => state }));
vi.mock("@/lib/use-wishlist", () => ({ useWishlist: () => state }));
beforeEach(() => { state.count = 3; state.itemCount = 2; state.ready = true; state.detail = [{}]; localStorage.clear(); document.cookie = "prosanti-lang=; Max-Age=0"; });
afterEach(cleanup);
it("names header counters in Bengali with Bengali counts", () => {
  render(<LanguageProvider initialLang="bn"><CartButton /><WishlistButton /></LanguageProvider>);
  expect(screen.getByRole("button", { name: "ব্যাগ খুলুন, ২টি পণ্য" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "পছন্দের তালিকা খুলুন, ৩টি পণ্য সেভ করা" })).toBeInTheDocument();
});
it("does not describe an unresolved saved bag as zero items", () => {
  state.itemCount = 0; state.detail = [];
  render(<CartButton />);
  expect(screen.getByRole("button", { name: "Open bag, saved items awaiting product details" })).toBeInTheDocument();
});
it("describes a loading bag without announcing an unverified count", () => {
  state.ready = false;
  render(<CartButton />);
  expect(screen.getByRole("button", { name: "Open bag, loading items" })).toBeInTheDocument();
});

it("does not call a syncing wishlist empty", () => {
  state.ready = false; state.count = 0;
  render(<WishlistButton />);
  expect(screen.getByRole("link", { name: "Open wishlist, syncing saved items" })).toBeInTheDocument();
});
