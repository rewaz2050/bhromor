/** JSONB contract for ps_funnel_report, checked before the legacy parser.
 * Preserve SQL metrics and existing calculations; never fill invalid values. */
type Row = Record<string, unknown>;
const row = (value: unknown): value is Row =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const numbers = (value: Row, keys: readonly string[]): boolean =>
  keys.every((key) => finite(value[key]));
const list = (value: unknown, valid: (item: Row) => boolean): boolean =>
  Array.isArray(value) && value.every((item) => row(item) && valid(item));

export function isFunnelRpc(value: unknown, days: 7 | 28): boolean {
  return (
    row(value) &&
    value.days === days &&
    numbers(value, [
      "sessions",
      "page_views",
      "bounced_sessions",
      "pdp_sessions",
      "atc_sessions",
      "checkout_sessions",
      "purchase_sessions",
      "orders",
      "customers",
      "repeat_customers",
      "home_sessions",
    ]) &&
    (value.aov === null || finite(value.aov)) &&
    list(
      value.atc_by_source,
      (item) => typeof item.source === "string" && finite(item.count),
    ) &&
    list(
      value.top_searches,
      (item) =>
        typeof item.query === "string" &&
        numbers(item, ["count", "max_results"]),
    ) &&
    list(value.home_scroll, (item) => numbers(item, ["depth", "sessions"]))
  );
}
