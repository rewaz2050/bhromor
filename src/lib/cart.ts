import type { Product } from "./catalog";
import { resolveCatalogProduct } from "./live-catalog";
import { totalInPaisa } from "./format";

/** Cart model — pure functions so they are easy to unit test. */

export interface CartLine {
  productId: string;
  /** Selected variant label, e.g. "Forest Green · L" (or color/size as applicable). */
  variantLabel: string;
  qty: number;
}

export const CART_STORAGE_KEY = "prosanti.cart.v1";

/** Per-line quantity ceiling — the product page capped at 9 while the cart
 *  had no limit at all, so the same cart could hold 40 of one item. */
export const MAX_LINE_QTY = 10;

const clampQty = (qty: number): number =>
  Math.max(1, Math.min(MAX_LINE_QTY, Math.floor(qty)));

/** Resolves through the live registry first, then the seeds. */
export const resolveProduct = (productId: string): Product | undefined =>
  resolveCatalogProduct(productId);

export const addLine = (
  lines: CartLine[],
  productId: string,
  variantLabel: string,
  qty = 1,
): CartLine[] => {
  const existing = lines.find(
    (l) => l.productId === productId && l.variantLabel === variantLabel,
  );
  if (existing) {
    return lines.map((l) =>
      l === existing ? { ...l, qty: clampQty(l.qty + qty) } : l,
    );
  }
  return [...lines, { productId, variantLabel, qty: clampQty(qty) }];
};

export const removeLine = (
  lines: CartLine[],
  productId: string,
  variantLabel: string,
): CartLine[] =>
  lines.filter(
    (l) => !(l.productId === productId && l.variantLabel === variantLabel),
  );

export const setQty = (
  lines: CartLine[],
  productId: string,
  variantLabel: string,
  qty: number,
): CartLine[] => {
  if (qty <= 0) return removeLine(lines, productId, variantLabel);
  return lines.map((l) =>
    l.productId === productId && l.variantLabel === variantLabel
      ? { ...l, qty: clampQty(qty) }
      : l,
  );
};

export interface CartSummary {
  lines: (CartLine & { product: Product; lineTotal: number })[];
  itemCount: number;
  subtotal: number;
}

export const summarize = (lines: CartLine[]): CartSummary => {
  const detailed = lines
    // Guard against corrupted/legacy storage payloads.
    .filter(
      (l): l is CartLine =>
        !!l &&
        typeof l.productId === "string" &&
        typeof l.variantLabel === "string" &&
        Number.isFinite(l.qty) &&
        l.qty > 0,
    )
    .map((l) => {
      const product = resolveProduct(l.productId);
      if (!product) return null;
      return { ...l, product, lineTotal: product.price * l.qty };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
  return {
    lines: detailed,
    itemCount: detailed.reduce((n, l) => n + l.qty, 0),
    subtotal: totalInPaisa(detailed.map((l) => l.lineTotal)),
  };
};

/** First available size/color used by “Quick Add”. */
export const defaultVariant = (product: Product): string => {
  const color = product.colors[0];
  const size = product.sizes[0];
  if (color && size && size !== "Free Size" && size !== "One Size") {
    return `${color} · ${size}`;
  }
  return color ?? size ?? "Default";
};
