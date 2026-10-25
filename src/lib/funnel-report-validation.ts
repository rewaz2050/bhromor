/** Browser API boundary guards. Validate, never coerce or manufacture metrics.
 * Server-side RPC parsers and all funnel/financial calculations stay unchanged. */
import type { FunnelReport } from "./funnel-events";
import type { ShopFunnel } from "./shop-funnel";

export const INVALID_FUNNEL_RESPONSE =
  "The funnel response could not be validated. Try again.";

type Row = Record<string, unknown>;
const row = (value: unknown): value is Row =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const numbers = (value: Row, keys: readonly string[]) =>
  keys.every((key) => finite(value[key]));
const list = (value: unknown, valid: (item: Row) => boolean) =>
  Array.isArray(value) && value.every((item) => row(item) && valid(item));
const sources = (value: unknown) =>
  list(value, (item) => typeof item.source === "string" && finite(item.count));

export function isFunnelReport(
  value: unknown,
  days: 7 | 28,
): value is FunnelReport {
  return (
    row(value) &&
    value.days === days &&
    numbers(value, [
      "sessions",
      "pageViews",
      "bounceRate",
      "pagesPerSession",
      "pdpSessions",
      "atcSessions",
      "checkoutSessions",
      "purchaseSessions",
      "orders",
      "aov",
      "repeatRate",
      "customers",
    ]) &&
    sources(value.atcBySource) &&
    list(
      value.topSearches,
      (item) =>
        typeof item.query === "string" &&
        finite(item.count) &&
        typeof item.zeroResults === "boolean",
    ) &&
    list(value.homeScroll, (item) => finite(item.depth) && finite(item.share))
  );
}

export function isShopFunnel(
  value: unknown,
  days: 7 | 28,
): value is ShopFunnel {
  return (
    row(value) &&
    value.days === days &&
    (value.shopId === null || typeof value.shopId === "string") &&
    numbers(value, [
      "sessions",
      "pageViews",
      "pdpSessions",
      "addToCartSessions",
      "checkoutSessions",
      "purchaseSessions",
      "orders",
      "revenue",
      "units",
    ]) &&
    (value.aov === null || finite(value.aov)) &&
    sources(value.atcBySource) &&
    list(
      value.topProducts,
      (item) =>
        typeof item.productId === "string" &&
        typeof item.name === "string" &&
        (item.slug === undefined || typeof item.slug === "string") &&
        numbers(item, ["views", "adds", "orders"]),
    )
  );
}
