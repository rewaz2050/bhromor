"use client";

/**
 * A3 (2026-09-28) — "make another one like this".
 *
 * One tap creates a DRAFT copy (same photos, price, sizes; fresh slug/SKU)
 * and opens it in the editor, because the next thing the seller wants is to
 * swap the photo and the price — not to hunt for the new row in the list.
 *
 * Failure is shown, never swallowed: the same honesty rule as the rest of
 * the vendor surface (a dead button with no message is what started this
 * whole round).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Product } from "@/lib/catalog";
import { duplicateDraft, type CloneContext } from "@/lib/product-clone";

export default function DuplicateProductButton({
  product,
  context,
  create,
  className = "",
}: {
  product: Product;
  /** Slugs/SKUs the shop already uses, so the copy never clashes. */
  context: CloneContext;
  /** Posts the new row and returns it (server-minted id). */
  create: (copy: Product) => Promise<Product>;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const copy = await create(duplicateDraft(product, context, { id: `copy-${Date.now()}` }));
      router.push(`/vendor/products/${encodeURIComponent(copy.id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make a copy — please try again.");
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        data-testid="duplicate-product"
        className={`inline-flex min-h-9 items-center rounded-full border border-line bg-paper px-3 py-1 text-[0.7rem] font-semibold text-forest-800 transition-colors hover:bg-ivory-100 disabled:opacity-60 ${className}`}
      >
        {busy ? "Copying…" : "Duplicate"}
      </button>
      {error && (
        <span role="alert" className="text-[0.7rem] font-medium text-rose-700">
          {error}
        </span>
      )}
    </span>
  );
}
