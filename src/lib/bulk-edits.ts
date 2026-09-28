/**
 * A4 (2026-09-28) — bulk price & stock edits (docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md).
 *
 * Before a festival a shop changes fifty prices; doing it row by row was an
 * hour of typing and one mis-tap away from a wrong price. This module
 * computes the change set — and nothing else — so the UI can show the
 * seller exactly what will happen before a single row is saved.
 *
 * Honesty rules:
 *   • a price never falls below ৳1 (a percent cut can never make an item free);
 *   • rows where nothing would change are not "saved", they are reported as
 *     already correct — no phantom edits in the summary;
 *   • a product with a per-size grid is never handed a made-up distribution:
 *     "set total" skips it with the reason, and the seller either picks
 *     "every size" or opens the row.
 */

import type { Product } from "./catalog";
import { LOW_STOCK_AT } from "./product-shelf";

/** ৳1 — the floor a percentage cut may never cross. */
export const MIN_PRICE_PAISA = 100;

export type PriceEdit = { kind: "percent"; percent: number } | { kind: "set"; taka: number };
export type StockEdit =
  | { kind: "total"; value: number }
  | { kind: "perSize"; value: number }
  | { kind: "soldOut" };

export interface BulkRowSummary {
  id: string;
  name: string;
  /** Human line, e.g. "৳1,200 → ৳1,080" or "12 → 0 in stock". */
  priceLine?: string;
  stockLine?: string;
}

export interface BulkEditPlan {
  /** Full rows to save (only the ones that actually change). */
  changes: Product[];
  summary: BulkRowSummary[];
  /** Rows this edit deliberately does not touch, with the reason. */
  skipped: { id: string; name: string; reason: string }[];
  /** Rows the edit matched but that already had the target value. */
  unchanged: number;
}

const clampPrice = (paisa: number): number => Math.max(MIN_PRICE_PAISA, Math.round(paisa));

const hasSizeGrid = (p: Product): boolean => !!p.sizeStock && Object.keys(p.sizeStock).length > 0;

const taka = (paisa: number): string =>
  `৳${(paisa / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

const nextPrice = (price: number, edit: PriceEdit): number =>
  edit.kind === "percent" ? clampPrice(price * (1 + edit.percent / 100)) : clampPrice(edit.taka * 100);

/**
 * Compute the rows a bulk edit would produce. `changes` are ready to PATCH
 * (they are the whole product, with price/stock already applied).
 */
export const planBulkEdit = (
  products: Product[],
  edit: { price?: PriceEdit; stock?: StockEdit },
  options: { lowStockAt?: number } = {},
): BulkEditPlan => {
  const lowStockAt = options.lowStockAt ?? LOW_STOCK_AT;
  const changes: Product[] = [];
  const summary: BulkRowSummary[] = [];
  const skipped: BulkEditPlan["skipped"] = [];
  let unchanged = 0;

  for (const product of products) {
    const line: BulkRowSummary = { id: product.id, name: product.name };
    let next: Product = product;
    let touched = false;

    if (edit.price) {
      const target = nextPrice(product.price, edit.price);
      if (target !== product.price) {
        line.priceLine = `${taka(product.price)} → ${taka(target)}`;
        next = { ...next, price: target };
        touched = true;
      }
    }

    if (edit.stock) {
      const stockEdit = edit.stock;
      const grid = hasSizeGrid(product);
      // For a sized row the per-size numbers ARE the shelf, so the "before"
      // figure the seller reads must be their sum, not a stale total.
      const stockOf = (p: Product): number =>
        hasSizeGrid(p)
          ? Object.values(p.sizeStock ?? {}).reduce((sum, n) => sum + n, 0)
          : typeof p.stock === "number"
            ? p.stock
            : p.inStock
              ? 1
              : 0;

      if (stockEdit.kind === "total" && grid) {
        // Never invent a distribution across sizes: say so and let the
        // seller pick "each size" or open the row.
        skipped.push({
          id: product.id,
          name: product.name,
          reason: "has per-size stock — use “each size” or open the row",
        });
        if (!touched) continue;
      } else if (stockEdit.kind === "soldOut") {
        const before = stockOf(product);
        next = {
          ...next,
          stock: 0,
          inStock: false,
          lowStock: false,
          ...(grid
            ? {
                sizeStock: Object.fromEntries(
                  Object.keys(product.sizeStock ?? {}).map((sz) => [sz, 0]),
                ),
              }
            : {}),
        };
        line.stockLine = `${before} → 0 in stock`;
        touched = true;
      } else {
        const perSize = stockEdit.kind === "perSize" && grid;
        const value = stockEdit.value;
        const sizes = Object.keys(product.sizeStock ?? {});
        const before = stockOf(product);
        const total = perSize ? value * sizes.length : value;
        next = {
          ...next,
          stock: total,
          inStock: total > 0,
          lowStock: total > 0 && total <= lowStockAt,
          ...(perSize
            ? { sizeStock: Object.fromEntries(sizes.map((sz) => [sz, value])) }
            : {}),
        };
        line.stockLine = perSize
          ? `${before} → ${value} per size (${total} total)`
          : `${before} → ${total} in stock`;
        touched = true;
      }
    }

    if (touched) {
      changes.push(next);
      summary.push(line);
    } else if (!line.priceLine && !line.stockLine) {
      unchanged += 1;
    }
  }

  return { changes, summary, skipped, unchanged };
};

/** The diff lines the confirm panel shows, in one string per row. */
export const summaryLines = (row: BulkRowSummary): string =>
  [row.priceLine, row.stockLine].filter(Boolean).join(" · ");
