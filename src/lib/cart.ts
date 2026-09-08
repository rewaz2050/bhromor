import { PRODUCTS, type Product } from "./catalog";
import { totalInPaisa } from "./format";

/** Cart model — pure functions so they are easy to unit test. */

export interface CartLine {
  productId: string;
  /** Selected variant label, e.g. "Forest Green · L" (or color/size as applicable). */
  variantLabel: string;
  qty: number;
}

export const CART_STORAGE_KEY = "prosanti.cart.v1";

export const resolveProduct = (productId: string): Product | undefined =>
  PRODUCTS.find((p) => p.id === productId);

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
      l === existing ? { ...l, qty: l.qty + qty } : l,
    );
  }
  return [...lines, { productId, variantLabel, qty }];
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
      ? { ...l, qty }
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
