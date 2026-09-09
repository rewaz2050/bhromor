import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  AccountWishlistProvider,
  useAccountWishlist,
} from "../account-wishlist-provider";
import { useWishlist } from "@/lib/use-wishlist";
import {
  clearWishlistStore,
  getWishlist,
  toggleWishlistStore,
} from "@/lib/wishlist-store";
import { PRODUCTS } from "@/lib/catalog";

const remote = vi.hoisted(() => ({ ids: [] as string[], fail: false }));
vi.mock("@/lib/account-wishlist", () => ({
  readAccountWishlist: vi.fn(async () => {
    if (remote.fail) throw new Error("offline");
    return [...remote.ids];
  }),
  saveAccountItems: vi.fn(async (_client, _uid, ids: string[]) => {
    if (remote.fail) throw new Error("offline");
    remote.ids = [...new Set([...remote.ids, ...ids])];
  }),
  removeAccountItems: vi.fn(async (_client, _uid, id?: string) => {
    if (remote.fail) throw new Error("offline");
    remote.ids = id ? remote.ids.filter((x) => x !== id) : [];
  }),
}));
import { saveAccountItems } from "@/lib/account-wishlist";
const client = {} as SupabaseClient;
function Consumer() {
  const wishlist = useWishlist();
  const cloud = useAccountWishlist();
  return (
    <>
      <output aria-label="saved">{wishlist.ids.join(",")}</output>
      <output aria-label="error">{wishlist.error}</output>
      <button
        disabled={!wishlist.ready || wishlist.busy}
        onClick={() => void wishlist.toggle(PRODUCTS[0].id)}
      >
        Toggle
      </button>
      <button
        disabled={!wishlist.ready || wishlist.busy}
        onClick={() => void cloud?.importGuest()}
      >
        Import
      </button>
      <button onClick={() => void wishlist.retry?.()}>Retry</button>
    </>
  );
}
function tree(uid: string | null) {
  return (
    <AccountWishlistProvider
      key={uid ?? "guest"}
      client={uid ? client : null}
      userId={uid}
      authLoading={false}
    >
      <Consumer />
    </AccountWishlistProvider>
  );
}
beforeEach(() => {
  clearWishlistStore();
  remote.ids = [];
  remote.fail = false;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("Account wishlist isolation", () => {
  it("only imports guest data with consent and merges without duplicates", async () => {
    toggleWishlistStore(PRODUCTS[0].id);
    remote.ids = [PRODUCTS[1].id];
    render(tree("customer-a"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Import" })).toBeEnabled(),
    );
    expect(screen.getByLabelText("saved")).toHaveTextContent(PRODUCTS[1].id);
    expect(saveAccountItems).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(saveAccountItems).toHaveBeenCalledWith(
        client,
        "customer-a",
        [PRODUCTS[0].id],
        // Serving catalog the ids were validated against (live or seeds).
        expect.any(Array),
      ),
    );
    await waitFor(() =>
      expect(screen.getByLabelText("saved")).toHaveTextContent(
        `${PRODUCTS[1].id},${PRODUCTS[0].id}`,
      ),
    );
    expect(getWishlist()).toEqual([PRODUCTS[0].id]);
  });
  it("does not claim a successful write offline and can retry", async () => {
    render(tree("customer-a"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Toggle" })).toBeEnabled(),
    );
    remote.fail = true;
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    await waitFor(() =>
      expect(screen.getByLabelText("error")).toHaveTextContent(
        "Wishlist sync failed",
      ),
    );
    expect(screen.getByLabelText("saved")).toBeEmptyDOMElement();
    expect(screen.getByRole("button", { name: "Toggle" })).toBeDisabled();
    remote.fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Toggle" })).toBeEnabled(),
    );
  });
  it("never copies account data into guest storage on sign-out or account switch", async () => {
    toggleWishlistStore(PRODUCTS[0].id);
    remote.ids = [PRODUCTS[1].id];
    const { rerender } = render(tree("customer-a"));
    await waitFor(() =>
      expect(screen.getByLabelText("saved")).toHaveTextContent(PRODUCTS[1].id),
    );
    rerender(tree(null));
    expect(screen.getByLabelText("saved")).toHaveTextContent(PRODUCTS[0].id);
    remote.ids = [];
    rerender(tree("customer-b"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Toggle" })).toBeEnabled(),
    );
    expect(screen.getByLabelText("saved")).toBeEmptyDOMElement();
    expect(getWishlist()).toEqual([PRODUCTS[0].id]);
  });
});
