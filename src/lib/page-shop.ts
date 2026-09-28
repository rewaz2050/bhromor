/**
 * B4 (2026-09-28) — "this page belongs to shop X", for the funnel.
 *
 * A shop needs to know how many people opened its storefront before it can
 * make sense of the rest of its funnel. The product-level events (view_item,
 * add_to_cart, select_item, purchase) already carry the shop id, but a
 * `page_view` is fired by the route tracker, which knows only the pathname —
 * and a slug is not an id.
 *
 * So the shop page registers itself here while it is on screen, and the route
 * tracker stamps the page_view with it. React runs a child's effect before its
 * parent's, so the shop is registered before the tracker fires; leaving the
 * page runs the cleanup, so the next page_view is NOT attributed to the shop
 * the shopper just left. Deliberately tiny and React-free, so both ends can be
 * tested without a renderer.
 */

let pageShop: string | null = null;

/** The shop whose storefront is on screen right now (null = an ordinary page). */
export const setPageShop = (shopId: string | null): void => {
  pageShop = shopId && shopId.trim() !== "" ? shopId.trim().slice(0, 80) : null;
};

export const currentPageShop = (): string | null => pageShop;

/** Test hook — forget the registered shop. */
export const __resetPageShop = (): void => {
  pageShop = null;
};
