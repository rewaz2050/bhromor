"use client";

/**
 * C6 — a vendor's own subcategories, beneath platform-owned top-levels.
 *
 * Product.category remains the platform's stable taxonomy key. The vendor's
 * names are suggestions for Product.subCategory (still plain text), so they
 * appear in the product editor without changing public product/catalog shape.
 */

import { useState } from "react";
import { useVendor } from "@/components/vendor/vendor-shell";
import { useVendorCategories } from "@/lib/use-vendor";
import { vendorErrorMessage } from "@/lib/use-vendor";

export default function VendorCategoryManagerCard() {
  const me = useVendor();
  const { categories, vendorCategories, loading, error, refresh, createCategory } =
    useVendorCategories(me !== null);
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const add = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const created = await createCategory(categoryId, name);
      setName("");
      setMessage(`“${created.name}” is ready to use in the product editor.`);
    } catch (err) {
      setMessage(vendorErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      aria-labelledby="vendor-category-heading"
      className="rounded-2xl bg-paper p-5 ring-1 ring-line sm:p-6"
      data-testid="vendor-category-manager"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-gold-700">
            Your shelves
          </p>
          <h2 id="vendor-category-heading" className="mt-1 font-display text-lg text-forest-950">
            Product subcategories
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-ink-soft">
            Choose a PROSANTI top-level category, then add your own subcategory. The top-level list
            stays platform-managed; your names appear as suggestions when you add or edit a product.
          </p>
        </div>
        {error ? (
          <button
            type="button"
            onClick={refresh}
            className="min-h-10 rounded-full px-3 text-xs font-semibold text-forest-800 ring-1 ring-line"
          >
            Retry
          </button>
        ) : null}
      </div>

      <form onSubmit={add} className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink">Top-level category</span>
          <select
            className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            disabled={loading || categories.length === 0}
            required
          >
            <option value="">Choose category…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-ink">Your subcategory</span>
          <input
            className="min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Eid collection"
            minLength={2}
            maxLength={60}
            required
          />
        </label>
        <button
          type="submit"
          disabled={saving || loading || !categoryId || name.trim().length < 2}
          className="mt-auto inline-flex min-h-11 items-center justify-center rounded-full bg-forest-800 px-5 text-sm font-semibold text-white transition-colors hover:bg-forest-950 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add subcategory"}
        </button>
      </form>

      {message ? (
        <p role="status" className="mt-3 text-xs font-medium text-forest-800">
          {message}
        </p>
      ) : null}
      {error ? <p role="alert" className="mt-3 text-xs text-red-700">{error}</p> : null}

      {vendorCategories.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Your subcategories">
          {vendorCategories.map((item) => {
            const parent = categories.find((category) => category.id === item.categoryId);
            return (
              <li
                key={item.id}
                className="rounded-full bg-forest-50 px-3 py-1.5 text-xs text-forest-900 ring-1 ring-forest-100"
                data-testid={`vendor-category-${item.id}`}
              >
                {parent?.name ? `${parent.name} · ` : ""}{item.name}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
