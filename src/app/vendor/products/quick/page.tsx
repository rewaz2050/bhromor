"use client";

/**
 * Quick add (2026-09-27, Phase 3) — the 4-field screen a shop owner uses on
 * the phone: photo, name, price, stock. Everything else is derived (slug,
 * SKU, sub-category) or optional (sizes), so the nine-section editor stays
 * the place for detail work instead of the place a product dies.
 *
 * Why it exists: a shop taking stock photos on a phone had to scroll the
 * full editor, and any one of its required fields (or the media-sign 403 it
 * hit before this round) left the row unsavable. Here the row is saved with
 * the shop's own vendor media sign route, published immediately when a photo
 * is attached, or parked as a draft (B8) when the photo is still coming.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVendor } from "@/components/vendor/vendor-shell";
import { ErrorBox, PageHeader, PrimaryLink } from "@/components/vendor/vendor-ui";
import type { Product } from "@/lib/catalog";
import MediaUploader from "@/components/admin/media-uploader";
import { field, label } from "@/components/admin/form-ui";
import { formatBdt } from "@/lib/format";
import { quickAddProduct, vendorTakeHome } from "@/lib/quick-add";
import type { MediaKind } from "@/lib/media";
import { useVendorCategories, useVendorProducts, vendorErrorMessage } from "@/lib/use-vendor";

export default function QuickAddPage() {
  const me = useVendor();
  const router = useRouter();
  const categories = useVendorCategories(me !== null);
  const { products, saveProduct } = useVendorProducts(me !== null);

  const [name, setName] = useState("");
  const [priceTaka, setPriceTaka] = useState("");
  const [stock, setStock] = useState("1");
  const [sizes, setSizes] = useState("");
  const [category, setCategory] = useState("");
  const [media, setMedia] = useState<
    { src: string; alt: string; kind?: MediaKind }[]
  >([]);
  const [saving, setSaving] = useState<"draft" | "publish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  // Adopt the first category once the list arrives — the API requires one and
  // a shop that never touched the field should not fail on it.
  useEffect(() => {
    if (category === "" && categories.categories.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- adopt the first category once
      setCategory(categories.categories[0].id);
    }
  }, [categories.categories, category]);

  const reset = () => {
    setName("");
    setPriceTaka("");
    setStock("1");
    setSizes("");
    setMedia([]);
    setError(null);
  };

  const submit = async (status: "draft" | "publish") => {
    setError(null);
    const built = quickAddProduct({
      name,
      priceTaka,
      stock,
      sizes,
      category,
      media,
      status: status === "publish" ? "published" : "draft",
    });
    if (!built.ok) {
      setError(built.error);
      return;
    }
    const product = { id: `quick-${Date.now()}`, ...built.product };
    setSaving(status);
    try {
      await saveProduct(product as unknown as Product, true);
      setSavedName(name.trim());
      reset();
      // The list is the proof it landed — never leave the shop guessing.
      router.prefetch("/vendor/products");
      void products;
    } catch (err) {
      setError(vendorErrorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Quick add"
        sub="Photo, name, price, stock — one screen. The full editor stays one tap away for details."
        action={<PrimaryLink href="/vendor/products/new">Full editor instead →</PrimaryLink>}
      />

      {savedName && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900 ring-1 ring-emerald-200"
        >
          “{savedName}” saved.{" "}
          <Link href="/vendor/products" className="underline underline-offset-2">
            See it in your products →
          </Link>
        </p>
      )}

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}

      <div className="space-y-4 rounded-2xl bg-paper p-5 ring-1 ring-line">
        <div>
          <span className={label}>Photo</span>
          <MediaUploader
            signPath="/api/vendor/media/sign"
            folder="prosanti/products"
            onUploaded={(url, alt, kind) =>
              setMedia((prev) =>
                prev.some((m) => m.src === url)
                  ? prev
                  : [...prev, { src: url, alt, kind }].slice(0, 12),
              )
            }
          />
          {media.length > 0 && (
            <ul className="mt-3 space-y-2">
              {media.map((m, i) => (
                <li
                  key={m.src}
                  className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-line"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- uploaded from the phone, any host */}
                  <img src={m.src} alt={m.alt} className="h-10 w-10 rounded-lg object-cover" />
                  <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
                    {i === 0 ? "Cover · " : ""}
                    {m.alt || m.src}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMedia((prev) => prev.filter((x) => x.src !== m.src))}
                    className="text-xs font-semibold text-rose-800 underline underline-offset-2"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1.5 text-xs text-ink-soft">
            First photo is the card cover. You can publish with just one and add
            the rest later in the editor.
          </p>
        </div>

        <label className="block">
          <span className={label}>Product name *</span>
          <input
            className={field}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Cotton panjabi — ivory"
            aria-label="Product name"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block">
            <span className={label}>Price (৳) *</span>
            <input
              className={field}
              type="number"
              min="1"
              step="1"
              value={priceTaka}
              onChange={(e) => setPriceTaka(e.target.value)}
              placeholder="1200"
              aria-label="Price in taka"
            />
          </label>
          <label className="block">
            <span className={label}>Stock</span>
            <input
              className={field}
              type="number"
              min="0"
              step="1"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
              aria-label="Stock"
            />
          </label>
          <label className="block">
            <span className={label}>Sizes (optional)</span>
            <input
              className={field}
              value={sizes}
              onChange={(e) => setSizes(e.target.value)}
              placeholder="M, L, XL"
              aria-label="Sizes"
            />
          </label>
        </div>

        <label className="block">
          <span className={label}>Category *</span>
          <select
            className={field}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
          >
            {categories.categories.length === 0 && <option value="">Loading…</option>}
            {categories.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving !== null}
            onClick={() => void submit("publish")}
            className="min-h-11 rounded-full bg-forest-800 px-6 text-sm font-semibold text-ivory-50 hover:bg-forest-700 disabled:opacity-60"
          >
            {saving === "publish" ? "Publishing…" : "Publish now"}
          </button>
          <button
            type="button"
            disabled={saving !== null}
            onClick={() => void submit("draft")}
            className="min-h-11 rounded-full bg-paper px-5 text-sm font-semibold text-forest-800 ring-1 ring-forest-300 hover:bg-forest-50 disabled:opacity-60"
          >
            {saving === "draft" ? "Saving…" : "Save as draft (photo later)"}
          </button>
          {priceTaka !== "" && Number(priceTaka) > 0 && (
            <span className="text-xs text-ink-soft">
              You earn about{" "}
              {formatBdt(vendorTakeHome(Number(priceTaka), me?.shop.commissionPct ?? 15))}{" "}
              after the {Math.round(me?.shop.commissionPct ?? 15)}% commission.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
