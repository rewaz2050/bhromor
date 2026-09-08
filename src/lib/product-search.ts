import type { Product } from "./catalog";

/** Shared by the header preview and the shop so both return the same matches. */
export function matchesProduct(product: Product, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase().normalize("NFC");
  return [
    product.name,
    product.nameBn ?? "",
    product.subCategory,
    product.sku,
    product.category,
  ].some((value) =>
    value.toLocaleLowerCase().normalize("NFC").includes(normalized),
  );
}

export function shopSearchHref(query: string): string {
  const value = query.trim();
  return value ? `/shop?${new URLSearchParams({ q: value })}` : "/shop";
}
