/** Validate the JSONB wire contract of ps_shop_funnel_report before its
 * forgiving legacy parser can coerce missing or malformed data into metrics.
 * SQL calculations remain the source of truth; this guard never recalculates. */
type Row = Record<string, unknown>;
const row = (value: unknown): value is Row =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const numbers = (value: Row, keys: readonly string[]): boolean =>
  keys.every((key) => finite(value[key]));
const list = (value: unknown, valid: (item: Row) => boolean): boolean =>
  Array.isArray(value) && value.every((item) => row(item) && valid(item));

export function isShopFunnelRpc(
  value: unknown,
  shopId: string,
  days: 7 | 28,
): boolean {
  return (
    row(value) &&
    shopId.trim() !== "" &&
    value.shop_id === shopId.trim() &&
    value.days === days &&
    numbers(value, [
      "sessions",
      "page_views",
      "pdp_sessions",
      "atc_sessions",
      "checkout_sessions",
      "purchase_sessions",
      "orders",
      "revenue",
      "units",
    ]) &&
    (value.aov === null || finite(value.aov)) &&
    list(
      value.atc_by_source,
      (item) => typeof item.source === "string" && finite(item.count),
    ) &&
    list(
      value.top_products,
      (item) =>
        typeof item.product_id === "string" &&
        typeof item.name === "string" &&
        (item.slug === undefined ||
          item.slug === null ||
          typeof item.slug === "string") &&
        numbers(item, ["views", "adds", "orders"]),
    )
  );
}
