"use client";

import { useState } from "react";
import {
  publishBlocker,
  shelfActions,
  shelfState,
  type ShelfProduct,
} from "@/lib/product-shelf";

interface Props {
  product: ShelfProduct & { id: string; name: string };
  /** Partial PATCH; must throw an Error with the API message on failure. */
  onPatch: (
    id: string,
    patch: { status?: "draft" | "published"; active?: boolean },
  ) => Promise<void>;
  /** Compact chips for dense staff tables. */
  size?: "sm" | "md";
}

const TONE: Record<"primary" | "quiet" | "danger", string> = {
  primary: "bg-forest-800 text-ivory-50 hover:bg-forest-700",
  quiet: "border border-line text-forest-900 hover:bg-ivory-100",
  danger: "border border-rose-200 text-rose-700 hover:bg-rose-50",
};

/**
 * Publish / Unpublish / Archive / Restore straight from a product row.
 * One tap, in place — until 2026-09-18 every shelf change meant opening
 * the full editor, and the vendor list had no way to publish at all.
 */
export function ShelfRowActions({ product, onPatch, size = "md" }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const state = shelfState(product);
  const blocker = state === "draft" ? publishBlocker(product) : null;
  const pad = size === "sm" ? "px-2.5 py-1 text-[0.7rem]" : "px-3.5 py-1.5 text-xs";

  const run = async (label: string, patch: Parameters<typeof onPatch>[1], confirm?: string) => {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(label);
    setError(null);
    try {
      await onPatch(product.id, patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the product.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="shelf-actions">
      {shelfActions(product).map((action) => {
        const blocked = action.patch.status === "published" && blocker !== null;
        return (
          <button
            key={action.label}
            type="button"
            disabled={busy !== null || blocked}
            aria-label={`${action.label} ${product.name}`}
            title={blocked ? blocker ?? undefined : undefined}
            onClick={() => void run(action.label, action.patch, action.confirm)}
            className={`inline-flex items-center rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${pad} ${TONE[action.tone]}`}
          >
            {busy === action.label ? "Saving…" : action.label}
          </button>
        );
      })}
      {blocker && (
        <span className="text-[0.7rem] font-medium text-amber-800" role="note">
          {blocker}
        </span>
      )}
      {error && (
        <span role="alert" className="text-[0.7rem] font-medium text-rose-700">
          {error}
        </span>
      )}
    </div>
  );
}

export default ShelfRowActions;
