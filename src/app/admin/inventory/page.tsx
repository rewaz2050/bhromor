"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useCatalog } from "@/lib/use-catalog";
import { useSettings } from "@/lib/use-settings";
import { displayStock } from "@/lib/catalog-store";
import { formatBdt } from "@/lib/format";
import { field, hint, label } from "@/components/admin/form-ui";
import { IconCheck, IconSearch } from "@/components/ui/icons";

/** §57–58 inventory + configurable low-stock threshold. */
export default function AdminInventoryPage() {
  const { products, saveProduct } = useCatalog();
  const { settings, save: saveSettings } = useSettings();
  const [threshold, setThreshold] = useState(String(settings.lowStockThreshold));
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  const flashMessage = (text: string) => {
    setFlash(text);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 1800);
  };

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const thresholdValue = Math.max(0, Math.floor(Number(threshold) || 0));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter(
      (p) =>
        q === "" ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q),
    );
  }, [products, query]);

  const lowCount = products.filter(
    (p) => displayStock(p) > 0 && displayStock(p) <= thresholdValue,
  ).length;
  const outCount = products.filter((p) => displayStock(p) === 0).length;

  const commitThreshold = () => {
    saveSettings({ lowStockThreshold: thresholdValue });
    setThreshold(String(thresholdValue));
    flashMessage("Threshold saved");
  };

  const commitStock = (id: string) => {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    // An untouched row used to save as 0 — `Number(undefined) || 0` wiped the
    // real stock the moment anyone pressed Save.
    const raw = drafts[id];
    const parsed = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
    const value = Number.isFinite(parsed)
      ? Math.max(0, Math.floor(parsed))
      : displayStock(product);
    saveProduct({
      ...product,
      stock: value,
      inStock: value > 0,
      lowStock: value > 0 && value <= thresholdValue,
    });
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    flashMessage(`${product.name}: ${value} in stock`);
  };

  const stockOf = (id: string): string => {
    if (drafts[id] !== undefined) return drafts[id];
    const p = products.find((x) => x.id === id);
    return p ? String(displayStock(p)) : "0";
  };

  const level = (id: string): "out" | "low" | "ok" => {
    const value = Number(stockOf(id)) || 0;
    if (value === 0) return "out";
    if (value <= thresholdValue) return "low";
    return "ok";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">
            Inventory
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Per-product stock control. Reserved quantities and variant-level
            counts arrive with the Supabase data layer (§57).
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or SKU…"
            aria-label="Search inventory"
            className="w-full rounded-full border-0 bg-paper py-2.5 pl-10 pr-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/70 focus:outline-none focus:ring-2 focus:ring-forest-600"
          />
        </div>
      </div>

      {/* Threshold — §58 */}
      <div className="flex flex-wrap items-end gap-4 rounded-2xl bg-paper p-5 ring-1 ring-line">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-gold-100 text-gold-600 text-lg font-bold">
            !
          </span>
          <div>
            <p className="text-sm font-semibold text-ink">Low-stock alert threshold</p>
            <p className="text-xs text-ink-soft">
              {lowCount} product{lowCount === 1 ? "" : "s"} at or below it · {outCount} out of stock
            </p>
          </div>
        </div>
        <div className="ml-auto flex items-end gap-2">
          <label className="block">
            <span className={label}>Units</span>
            <input
              className={`${field} w-24`}
              type="number"
              min="0"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={commitThreshold}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-forest-800 px-5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconCheck className="h-4 w-4" /> {flash ? "Saved" : "Save"}
          </button>
        </div>
        <p className="w-full text-xs text-ink-soft">
          The dashboard&apos;s low-stock card and this table use the same threshold.
        </p>
      </div>

      {/* Stock table */}
      {visible.length === 0 ? (
        <div className="rounded-2xl bg-paper py-16 text-center ring-1 ring-line">
          <p className="font-display text-lg text-forest-900">Nothing matches</p>
          <p className="mt-1 text-sm text-ink-soft">Try another search.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[0.68rem] uppercase tracking-[0.16em] text-ink-soft">
                  <th className="px-5 py-3.5 font-semibold">Product</th>
                  <th className="px-5 py-3.5 font-semibold">Variants</th>
                  <th className="px-5 py-3.5 font-semibold">Price</th>
                  <th className="px-5 py-3.5 font-semibold">Stock</th>
                  <th className="px-5 py-3.5 font-semibold">Level</th>
                  <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {visible.map((p) => {
                  const lvl = level(p.id);
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-ivory-100/70">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <Image
                            src={p.media[0]?.src ?? ""}
                            alt=""
                            width={44}
                            height={44}
                            className="h-11 w-11 shrink-0 rounded-lg bg-ivory-100 object-cover"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium text-ink">{p.name}</p>
                            <p className="text-xs text-ink-soft">{p.sku}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-ink-soft">
                        {p.colors.length} colour{p.colors.length === 1 ? "" : "s"} · {p.sizes.length} size{p.sizes.length === 1 ? "" : "s"}
                      </td>
                      <td className="px-5 py-3.5 font-medium text-ink">
                        {formatBdt(p.price)}
                      </td>
                      <td className="px-5 py-3.5">
                        <input
                          type="number"
                          min="0"
                          value={stockOf(p.id)}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                          }
                          onBlur={() => commitStock(p.id)}
                          aria-label={`Stock for ${p.name}`}
                          className="w-20 rounded-lg border-0 bg-ivory-50 px-3 py-1.5 text-sm text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-forest-600"
                        />
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ${
                            lvl === "out"
                              ? "bg-rose-100 text-rose-800"
                              : lvl === "low"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {lvl === "out"
                            ? "Out of stock"
                            : lvl === "low"
                              ? `Low (≤ ${thresholdValue})`
                              : "Healthy"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => commitStock(p.id)}
                          className="rounded-full px-3.5 py-1.5 text-xs font-semibold text-forest-800 ring-1 ring-forest-300 transition-colors hover:bg-forest-800 hover:text-ivory-50"
                        >
                          Update
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className={hint}>
        Conceptually available = stock − reserved (§57): reserving against an
        order, variant-level counts and restock history arrive with the
        database phase.
      </p>
    </div>
  );
}
