/**
 * "আবার অর্ডার করুন" — one tap puts a past order back in the bag.
 *
 * Pure planning only: each remembered line is matched against the LIVE
 * catalog and either re-added (same product, same variant, same qty) or
 * reported as skipped with a reason the UI can explain. Nothing is invented
 * — a piece that has gone, sold out, or lost that colour/size is skipped,
 * never swapped for something "similar". The checkout validator remains the
 * authority on what can actually be bought.
 */

import type { Product } from "./catalog";
import { MAX_LINE_QTY } from "./cart";

export interface ReorderLine {
  productId: string;
  /** Variant label as snapshotted on the order, e.g. "Forest Green · L". */
  variantLabel: string;
  qty: number;
  /** Display name from the order snapshot (for the skipped report). */
  name?: string;
}

export type SkipReason = "gone" | "out-of-stock" | "variant";

export interface ReorderPlan {
  add: { product: Product; variantLabel: string; qty: number }[];
  skipped: { name: string; reason: SkipReason }[];
}

/**
 * Mirrors the server's plausibility rule (order-validation.ts): whatever
 * colour / size the label names must still be on the product. Labels are
 * "Colour · Size", "Colour", "Size" or "Default" (size-finder's shape).
 */
export const variantStillOffered = (product: Product, label: string): boolean => {
  const clean = label.trim();
  if (clean === "" || clean.length > 120) return false;
  const parts = clean.split("·").map((s) => s.trim()).filter(Boolean);
  if (clean === "Default") return product.colors.length === 0 && product.sizes.length === 0;
  const pool = new Set([...product.colors, ...product.sizes]);
  return parts.every((part) => pool.has(part));
};

export const planReorder = (lines: ReorderLine[], catalog: Product[]): ReorderPlan => {
  const byId = new Map(catalog.map((p) => [p.id, p]));
  const plan: ReorderPlan = { add: [], skipped: [] };
  for (const line of lines) {
    const product = byId.get(line.productId);
    const name = line.name?.trim() || product?.name || line.productId;
    if (!product || product.active === false) {
      plan.skipped.push({ name, reason: "gone" });
      continue;
    }
    if (!product.inStock) {
      plan.skipped.push({ name, reason: "out-of-stock" });
      continue;
    }
    if (!variantStillOffered(product, line.variantLabel)) {
      plan.skipped.push({ name, reason: "variant" });
      continue;
    }
    const qty = Math.max(1, Math.min(MAX_LINE_QTY, Math.round(line.qty || 1)));
    plan.add.push({ product, variantLabel: line.variantLabel, qty });
  }
  return plan;
};
