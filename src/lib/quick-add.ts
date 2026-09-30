/**
 * Quick add (2026-09-27, Phase 3) — the pure half of /vendor/products/quick.
 *
 * The phone-first screen asks for four things (photo, name, price, stock) and
 * derives the rest. Everything the screen decides lives here so it can be
 * tested without a browser: the size string it parses, the SKU it mints (the
 * column is globally unique, so the SKU must never be a bare guess), and the
 * payload it posts.
 */

import { bdt } from "./format";
import { slugify } from "./catalog-store";
import type { MediaKind } from "./media";

/** "M, L, XL" → ["M","L","XL"] — trimmed, de-duplicated, capped at 16. */
export const parseSizes = (raw: string): string[] =>
  [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, 16);

/** Stock at or below this reads as "running low" (same rule as the shelf). */
export const QUICK_LOW_STOCK_AT = 5;

/**
 * A SKU that cannot clash with another shop's: the shop's name plus a seed
 * that changes per save. `products.sku` is unique across the whole database,
 * so a bare "P-PANJABI" would collide the moment a second shop sells one.
 */
export const quickSku = (name: string, seed = Date.now()): string =>
  `QK-${slugify(name).slice(0, 10).toUpperCase()}-${String(seed % 100_000).padStart(5, "0")}`;

export interface QuickAddFields {
  name: string;
  /** Taka, as typed. */
  priceTaka: string;
  stock: string;
  /** Comma-separated, optional. */
  sizes: string;
  category: string;
  media: { src: string; alt?: string; kind?: MediaKind }[];
  status: "draft" | "published";
  seed?: number;
}

export type QuickAddResult =
  | { ok: true; product: Record<string, unknown>; sizes: string[] }
  | { ok: false; error: string };

/** The exact POST body for /api/vendor/products, or the reason it cannot be. */
export const quickAddProduct = (fields: QuickAddFields): QuickAddResult => {
  const name = fields.name.trim();
  if (name.length < 2) {
    return { ok: false, error: "Product name is too short — customers search with it." };
  }
  const price = Number(fields.priceTaka);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, error: "Set the price in taka (e.g. 1200)." };
  }
  if (fields.category.trim() === "") {
    return { ok: false, error: "Pick a category." };
  }
  const media = fields.media.filter((m) => m.src.trim() !== "").slice(0, 12);
  if (fields.status === "published" && !media.some((m) => m.kind !== "video")) {
    return {
      ok: false,
      error: "A published product needs a photo — add one, or save it as a draft.",
    };
  }
  const units = Math.max(0, Math.floor(Number(fields.stock) || 0));
  const sizes = parseSizes(fields.sizes);
  const pricePaisa = bdt(price);
  return {
    ok: true,
    sizes,
    product: {
      name,
      slug: slugify(name),
      sku: quickSku(name, fields.seed),
      category: fields.category.trim(),
      subCategory: "",
      shortDescription: "",
      description: [],
      details: [],
      colors: [],
      sizes,
      featured: false,
      isNew: true,
      inStock: units > 0,
      lowStock: units > 0 && units <= QUICK_LOW_STOCK_AT,
      stock: units,
      price: pricePaisa,
      compareAtPrice: null,
      media: media.map((m) => ({
        src: m.src.trim(),
        alt: (m.alt ?? "").trim() || name,
        ...(m.kind === "video" ? { kind: "video" as const } : {}),
      })),
      status: fields.status,
      active: true,
    },
  };
};

/** What the shop keeps after the commission — shown under the price field. */
export const vendorTakeHome = (priceTaka: number, commissionPct: number): number =>
  Math.round(bdt(priceTaka) * (1 - Math.max(0, Math.min(90, commissionPct)) / 100));
