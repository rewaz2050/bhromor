/**
 * Shelf state of a catalog row — the one answer the product lists (staff
 * and vendor) give about "can a customer buy this right now, and if not,
 * what is the one tap that fixes it".
 *
 * Pure so it is unit-testable; the pages only render it.
 */

export type ShelfState = "live" | "draft" | "archived" | "out" | "low";

export interface ShelfProduct {
  status?: "draft" | "published";
  active?: boolean;
  inStock: boolean;
  lowStock?: boolean;
  stock?: number;
  media?: readonly { src: string }[];
  price: number;
}

/** Stock at or below this counts as "low" when the row has no explicit flag. */
export const LOW_STOCK_AT = 5;

export const shelfState = (p: ShelfProduct): ShelfState => {
  if (p.active === false) return "archived";
  if (p.status === "draft") return "draft";
  const stock = typeof p.stock === "number" ? p.stock : p.inStock ? null : 0;
  if (stock === 0 || !p.inStock) return "out";
  if (p.lowStock || (stock !== null && stock <= LOW_STOCK_AT)) return "low";
  return "live";
};

export const SHELF_META: Record<
  ShelfState,
  { label: string; cls: string; hint: string }
> = {
  live: {
    label: "Live",
    cls: "bg-forest-100 text-forest-900 ring-forest-200",
    hint: "Customers can buy this now.",
  },
  low: {
    label: "Low stock",
    cls: "bg-amber-100 text-amber-900 ring-amber-200",
    hint: "Still on sale — restock before it sells out.",
  },
  out: {
    label: "Sold out",
    cls: "bg-rose-100 text-rose-900 ring-rose-200",
    hint: "Shown, but nobody can add it to a bag until stock is added.",
  },
  draft: {
    label: "Draft",
    cls: "bg-ivory-200 text-ink ring-line",
    hint: "Invisible to customers until published.",
  },
  archived: {
    label: "Archived",
    cls: "bg-stone-200 text-stone-700 ring-stone-300",
    hint: "Hidden and unbuyable; order history keeps it.",
  },
};

/** Ordered filter tabs for a shelf list; `all` first. */
export const SHELF_FILTERS: readonly { id: ShelfState | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "live", label: "Live" },
  { id: "low", label: "Low stock" },
  { id: "out", label: "Sold out" },
  { id: "draft", label: "Drafts" },
  { id: "archived", label: "Archived" },
];

export const shelfCounts = (
  products: readonly ShelfProduct[],
): Record<ShelfState | "all", number> => {
  const out: Record<ShelfState | "all", number> = {
    all: products.length,
    live: 0,
    low: 0,
    out: 0,
    draft: 0,
    archived: 0,
  };
  for (const p of products) out[shelfState(p)] += 1;
  return out;
};

/**
 * What blocks "Publish" — a draft with no photo or a zero price would go
 * live as a broken card, so the list says so before the tap.
 */
export const publishBlocker = (p: ShelfProduct): string | null => {
  if (!p.media || p.media.length === 0) return "Add at least one photo first.";
  if (!(p.price > 0)) return "Set a price first.";
  return null;
};

export interface ShelfAction {
  label: string;
  /** PATCH body for /api/{admin,vendor}/products/[id]. */
  patch: { status?: "draft" | "published"; active?: boolean };
  /** Danger styling + confirm for archive. */
  tone: "primary" | "quiet" | "danger";
  confirm?: string;
}

/** The one or two taps a shelf row offers, in display order. */
export const shelfActions = (p: ShelfProduct & { name: string }): ShelfAction[] => {
  const state = shelfState(p);
  if (state === "archived") {
    return [{ label: "Restore", patch: { active: true }, tone: "primary" }];
  }
  if (state === "draft") {
    return [
      { label: "Publish", patch: { status: "published" }, tone: "primary" },
      {
        label: "Archive",
        patch: { active: false },
        tone: "danger",
        confirm: `Archive “${p.name}”? It disappears from the shop; you can restore it any time.`,
      },
    ];
  }
  return [
    { label: "Unpublish", patch: { status: "draft" }, tone: "quiet" },
    {
      label: "Archive",
      patch: { active: false },
      tone: "danger",
      confirm: `Archive “${p.name}”? It disappears from the shop; you can restore it any time.`,
    },
  ];
};
