/** Explicit shop-staff grants. Catalog deliberately includes prices/media and
 * variant structure; inventory alone is stock-only, never pricing or finance. */
export const VENDOR_PERMISSIONS = ["catalog", "inventory", "cashier", "cancellation"] as const;
export type VendorPermission = (typeof VENDOR_PERMISSIONS)[number];
export const VENDOR_PERMISSION_LABELS: Record<VendorPermission, string> = {
  catalog: "Catalog, prices, stock and product media",
  inventory: "Stock adjustments only (no prices)",
  cashier: "Verify/reject own-shop wallet payments",
  cancellation: "Cancel eligible own-shop orders",
};
export const vendorPermissions = (raw: unknown): VendorPermission[] =>
  Array.isArray(raw) ? VENDOR_PERMISSIONS.filter((key) => raw.includes(key)) : [];
export const vendorCan = (vendor: { role: string; permissions?: readonly string[] }, permission: VendorPermission): boolean =>
  vendor.role === "owner" || (vendor.role === "staff" && vendor.permissions?.includes(permission) === true);

export const vendorPathAllowed = (vendor: { role: string; permissions?: readonly string[] }, path: string): boolean => {
  if (vendor.role === "owner") return true;
  if (/^\/vendor\/(earnings|promo|funnel)(?:\/|$)/.test(path)) return false;
  if (/^\/vendor\/products(?:\/|$)/.test(path)) return vendorCan(vendor,"catalog");
  if (/^\/vendor\/inventory(?:\/|$)/.test(path)) return vendorCan(vendor,"inventory") || vendorCan(vendor,"catalog");
  return vendor.role === "staff";
};
