"use client";

/**
 * A4 (2026-09-28) — the bulk price & stock bar (docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md).
 *
 * Two steps, on purpose: choose an edit, then read the diff before anything
 * is saved. The seller sees every before → after line, the rows this edit
 * will NOT touch (with the reason), and only then the apply button.
 *
 * Saving is sequential and honest about partial failure: "4 saved · 1
 * failed — <reason>" rather than a green tick over a half-applied change.
 */

import { useMemo, useState } from "react";
import type { Product } from "@/lib/catalog";
import { planBulkEdit, summaryLines, type BulkEditPlan, type PriceEdit, type StockEdit } from "@/lib/bulk-edits";
import { formatBdt } from "@/lib/format";

export default function BulkEditBar({
  products,
  onApply,
  onDone,
}: {
  /** The selected rows. */
  products: Product[];
  /** Save one changed row (the vendor list passes `saveProduct(p, false)`). */
  onApply: (product: Product) => Promise<boolean>;
  /** Called after an apply run so the list can clear the selection. */
  onDone?: (saved: number, failed: number) => void;
}) {
  const [priceMode, setPriceMode] = useState<"percent" | "set">("percent");
  const [pricePercent, setPricePercent] = useState("-10");
  const [priceTaka, setPriceTaka] = useState("");
  const [stockMode, setStockMode] = useState<"total" | "perSize" | "soldOut">("total");
  const [stockValue, setStockValue] = useState("5");
  const [useStock, setUseStock] = useState(false);
  const [usePrice, setUsePrice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const priceEdit: PriceEdit | null = useMemo(() => {
    if (!usePrice) return null;
    if (priceMode === "percent") {
      const percent = Number(pricePercent);
      if (!Number.isFinite(percent) || percent === 0) return null;
      return { kind: "percent", percent };
    }
    const taka = Number(priceTaka);
    if (!Number.isFinite(taka) || taka <= 0) return null;
    return { kind: "set", taka };
  }, [usePrice, priceMode, pricePercent, priceTaka]);

  const stockEdit: StockEdit | null = useMemo(() => {
    if (!useStock) return null;
    if (stockMode === "soldOut") return { kind: "soldOut" };
    const value = Number(stockValue);
    if (!Number.isFinite(value) || value < 0) return null;
    return stockMode === "perSize"
      ? { kind: "perSize", value: Math.floor(value) }
      : { kind: "total", value: Math.floor(value) };
  }, [useStock, stockMode, stockValue]);

  const plan: BulkEditPlan | null = useMemo(
    () => (priceEdit || stockEdit ? planBulkEdit(products, { price: priceEdit ?? undefined, stock: stockEdit ?? undefined }) : null),
    [products, priceEdit, stockEdit],
  );

  const apply = async () => {
    if (!plan) return;
    setBusy(true);
    setError(null);
    setResult(null);
    let saved = 0;
    const failures: string[] = [];
    for (const row of plan.changes) {
      try {
        const ok = await onApply(row);
        if (ok) saved += 1;
        else failures.push(row.name);
      } catch (err) {
        failures.push(`${row.name}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    setBusy(false);
    setResult(
      failures.length === 0
        ? `Saved ${saved} ${saved === 1 ? "product" : "products"}.`
        : `Saved ${saved} · ${failures.length} failed — ${failures.slice(0, 2).join("; ")}`,
    );
    if (failures.length === 0) onDone?.(saved, 0);
  };

  return (
    <div className="mb-4 rounded-2xl bg-ivory-100 p-4 ring-1 ring-line" data-testid="bulk-edit-bar">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">
          {products.length} selected
        </p>

        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
          <input
            type="checkbox"
            checked={usePrice}
            onChange={(e) => setUsePrice(e.target.checked)}
            className="h-4 w-4 accent-forest-800"
          />
          Price
        </label>
        {usePrice && (
          <span className="inline-flex flex-wrap items-center gap-2">
            <select
              value={priceMode}
              onChange={(e) => setPriceMode(e.target.value as "percent" | "set")}
              className="rounded-full bg-paper px-3 py-1.5 text-xs ring-1 ring-line"
              aria-label="Price change kind"
            >
              <option value="percent">Change by %</option>
              <option value="set">Set to ৳</option>
            </select>
            {priceMode === "percent" ? (
              <input
                type="number"
                value={pricePercent}
                onChange={(e) => setPricePercent(e.target.value)}
                aria-label="Percent change"
                className="w-24 rounded-full bg-paper px-3 py-1.5 text-xs ring-1 ring-line"
              />
            ) : (
              <input
                type="number"
                value={priceTaka}
                onChange={(e) => setPriceTaka(e.target.value)}
                placeholder="999"
                aria-label="New price in taka"
                className="w-24 rounded-full bg-paper px-3 py-1.5 text-xs ring-1 ring-line"
              />
            )}
          </span>
        )}

        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
          <input
            type="checkbox"
            checked={useStock}
            onChange={(e) => setUseStock(e.target.checked)}
            className="h-4 w-4 accent-forest-800"
          />
          Stock
        </label>
        {useStock && (
          <span className="inline-flex flex-wrap items-center gap-2">
            <select
              value={stockMode}
              onChange={(e) => setStockMode(e.target.value as "total" | "perSize" | "soldOut")}
              className="rounded-full bg-paper px-3 py-1.5 text-xs ring-1 ring-line"
              aria-label="Stock change kind"
            >
              <option value="total">Set total stock</option>
              <option value="perSize">Set every size</option>
              <option value="soldOut">Mark sold out</option>
            </select>
            {stockMode !== "soldOut" && (
              <input
                type="number"
                value={stockValue}
                onChange={(e) => setStockValue(e.target.value)}
                aria-label="Stock value"
                className="w-20 rounded-full bg-paper px-3 py-1.5 text-xs ring-1 ring-line"
              />
            )}
          </span>
        )}
      </div>

      {plan && (
        <div className="mt-3 rounded-xl bg-paper p-3 ring-1 ring-line">
          <p className="text-xs font-semibold text-ink">
            {plan.changes.length === 0
              ? "Nothing would change."
              : `Will change ${plan.changes.length} ${plan.changes.length === 1 ? "product" : "products"}`}
          </p>
          {plan.changes.length > 0 && (
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-ink-soft" data-testid="bulk-preview">
              {plan.summary.slice(0, 20).map((row) => (
                <li key={row.id} className="flex flex-wrap gap-2">
                  <span className="min-w-0 flex-1 truncate text-ink">{row.name}</span>
                  <span>{summaryLines(row)}</span>
                </li>
              ))}
            </ul>
          )}
          {plan.skipped.length > 0 && (
            <p className="mt-2 text-[0.7rem] font-medium text-amber-800" data-testid="bulk-skipped">
              {plan.skipped.length} left alone: {plan.skipped[0].name} — {plan.skipped[0].reason}
              {plan.skipped.length > 1 ? ` (+${plan.skipped.length - 1} more)` : ""}
            </p>
          )}
          {plan.unchanged > 0 && (
            <p className="mt-1 text-[0.7rem] text-ink-soft">
              {plan.unchanged} already had this price/stock — skipped.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void apply()}
              disabled={busy || plan.changes.length === 0}
              data-testid="bulk-apply"
              className="inline-flex min-h-10 items-center rounded-full bg-forest-800 px-5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
            >
              {busy ? "Saving…" : `Apply to ${plan.changes.length}`}
            </button>
            {plan.changes.length > 0 && (
              <span className="text-[0.7rem] text-ink-soft">
                first: {formatBdt(products[0]?.price ?? 0)} today, {formatBdt(plan.changes[0].price)} after
              </span>
            )}
          </div>
        </div>
      )}

      {result && (
        <p role="status" className="mt-3 text-xs font-semibold text-forest-800">
          {result}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-xs font-semibold text-rose-700">
          {error}
        </p>
      )}
    </div>
  );
}
