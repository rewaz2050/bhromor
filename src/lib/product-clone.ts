/**
 * A3 (2026-09-28) — "make another one like this" (docs/SHOP-SERVICE-UPGRADE-PLAN-2026-09-28.md).
 *
 * A shop selling the same panjabi in six fabrics used to retype the whole
 * nine-section editor six times. This builds the copy as a **draft**: the
 * photos, sizes and price come along, but nothing reaches the storefront
 * until the seller publishes it — a duplicate that silently went live with
 * the old photos would be worse than retyping.
 *
 * The slug/SKU are chosen here, not left to the server: `createProduct`
 * refuses a same-shop clash before its retry loop (the vendor's RLS client
 * can see its own rows), so the copy must arrive with free ones.
 */

import type { Product } from "./catalog";
import { slugify } from "./catalog-store";

export const COPY_SUFFIX = " (copy)";

/** "Panjabi (copy)" — never "Panjabi (copy) (copy)" on a second copy. */
export const copyName = (name: string): string =>
  name.endsWith(COPY_SUFFIX) ? name.replace(/ \(copy(?: \d+)?\)$/, COPY_SUFFIX) : `${name}${COPY_SUFFIX}`;

/**
 * The first free spelling of `base`: base, base-2, base-3 … A shop
 * duplicating the same piece twice must not be told "slug already in use".
 */
export const nextFreeSpelling = (base: string, taken: Iterable<string>): string => {
  const used = new Set<string>();
  for (const value of taken) used.add(value);
  if (!used.has(base)) return base;
  for (let n = 2; n < 200; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  // Absurdly unlikely; still deterministic and unique per call.
  return `${base}-${Date.now()}`;
};

export interface CloneContext {
  /** Slugs already used by the rows the caller can see. */
  slugs: Iterable<string>;
  /** SKUs already used by the rows the caller can see. */
  skus: Iterable<string>;
}

/**
 * A publishable-shaped copy that starts its life as a draft. Media entries
 * are cloned (not shared) so editing the copy's gallery never mutates the
 * original, and sales figures never travel with it.
 */
export const duplicateDraft = (
  product: Product,
  context: CloneContext,
  options: { id?: string; now?: number } = {},
): Product => {
  const id = options.id ?? `${product.id}-copy-${options.now ?? Date.now()}`;
  return {
    ...product,
    id,
    name: copyName(product.name),
    slug: nextFreeSpelling(`${product.slug}-copy`, context.slugs),
    sku: nextFreeSpelling(`${product.sku}-C`, context.skus),
    // A copy is never born live, featured or "new" — the seller decides.
    status: "draft",
    featured: false,
    isNew: false,
    unitsSold: undefined,
    rating: 0,
    reviewCount: 0,
    media: product.media.map((m) => ({ ...m })),
    details: product.details.map((d) => ({ ...d })),
    colors: [...product.colors],
    sizes: [...product.sizes],
    description: [...product.description],
    ...(product.sizeStock ? { sizeStock: { ...product.sizeStock } } : {}),
    ...(product.seo ? { seo: { ...product.seo } } : {}),
  };
};

/** The slug a fresh copy would get — handy for tests and previews. */
export const cloneSlugPreview = (product: Product, taken: Iterable<string>): string =>
  nextFreeSpelling(`${product.slug}-copy`, taken) || slugify(product.name);
