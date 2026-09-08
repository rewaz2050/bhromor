"use client";

import { useState } from "react";
import { useCatalog } from "@/lib/use-catalog";
import { slugify } from "@/lib/catalog-store";
import { useTransientValue } from "@/lib/use-transient-value";
import { field, hint, label } from "@/components/admin/form-ui";
import {
  IconCheck,
  IconChevron,
  IconPlus,
  IconTrash,
} from "@/components/ui/icons";
import type { Category } from "@/lib/catalog";

function Row({
  category,
  first,
  last,
  onSave,
  onMove,
  onToggleActive,
}: {
  category: Category;
  first: boolean;
  last: boolean;
  onSave: (c: Category) => void;
  onMove: (dir: -1 | 1) => void;
  onToggleActive: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [nameBn, setNameBn] = useState(category.nameBn);
  const [tagline, setTagline] = useState(category.tagline);
  const [image, setImage] = useState(category.image);
  const [subs, setSubs] = useState<string[]>([...category.subCategories]);
  const [subInput, setSubInput] = useState("");
  const [saved, setSaved] = useTransientValue(false, 1600);
  const [dirty, setDirty] = useState(false);

  const addSub = () => {
    const v = subInput.trim();
    if (!v) return;
    setSubs((s) => (s.some((x) => x.toLowerCase() === v.toLowerCase()) ? s : [...s, v]));
    setSubInput("");
    setDirty(true);
  };

  const mark = (fn: () => void) => {
    fn();
    setDirty(true);
  };

  const save = () => {
    onSave({
      ...category,
      name: name.trim() || category.name,
      nameBn: nameBn.trim(),
      tagline: tagline.trim(),
      image: image.trim() || category.image,
      subCategories: subs,
    });
    setSaved(true);
    setDirty(false);
  };

  const inputCls = `${field} bg-ivory-100/60`;

  return (
    <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="font-display text-base font-medium text-forest-900">
              {name || category.name}
            </span>
            {category.active === false && (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-rose-800">
                Hidden
              </span>
            )}
            <span className="font-mono text-xs text-ink-soft">{category.id}</span>
          </div>
          {tagline && <p className="mt-0.5 truncate text-sm text-ink-soft">{tagline}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={first}
            aria-label="Move up"
            className="rounded-full p-2 text-ink-soft ring-1 ring-line disabled:opacity-30 hover:text-forest-800"
          >
            <IconChevron className="h-4 w-4 rotate-180" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            aria-label="Move down"
            className="rounded-full p-2 text-ink-soft ring-1 ring-line disabled:opacity-30 hover:text-forest-800"
          >
            <IconChevron className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToggleActive}
            className="rounded-full px-3.5 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:text-rose-700 hover:ring-rose-300"
          >
            {category.active === false ? "Show" : "Hide"}
          </button>
          <button
            type="button"
            onClick={save}
            className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconCheck className="h-3.5 w-3.5" />
            {saved ? "Saved" : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Name</span>
            <input className={inputCls} value={name} onChange={(e) => mark(() => setName(e.target.value))} />
          </label>
          <label className="block">
            <span className={label}>Name (বাংলা)</span>
            <input className={inputCls} value={nameBn} onChange={(e) => mark(() => setNameBn(e.target.value))} />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Tagline</span>
            <input className={inputCls} value={tagline} onChange={(e) => mark(() => setTagline(e.target.value))} />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Category image URL</span>
            <input className={inputCls} value={image} onChange={(e) => mark(() => setImage(e.target.value))} placeholder="/images/products/…" />
          </label>
        </div>
        <div>
          <span className={label}>Subcategories</span>
          <div className="flex flex-wrap gap-2">
            {subs.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-forest-100 px-3 py-1.5 text-xs font-medium text-forest-900">
                {s}
                <button
                  type="button"
                  aria-label={`Remove ${s}`}
                  onClick={() => mark(() => setSubs((x) => x.filter((y) => y !== s)))}
                  className="text-forest-700 hover:text-rose-600"
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              className={inputCls}
              value={subInput}
              onChange={(e) => setSubInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSub())}
              placeholder="Add subcategory (e.g. Pajama)"
            />
            <button
              type="button"
              onClick={addSub}
              aria-label="Add subcategory"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest-800 text-ivory-50 hover:bg-forest-700"
            >
              <IconPlus className="h-4 w-4" />
            </button>
          </div>
          <p className={hint}>Only categories holding products should appear on the storefront (§5).</p>
        </div>
      </div>
    </div>
  );
}

/** §5 data-driven category management. */
export default function AdminCategoriesPage() {
  const { categories, saveCategory, setCategoryActive, moveCategory } = useCatalog();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newBn, setNewBn] = useState("");

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    let id = slugify(name);
    let n = 2;
    while (categories.some((c) => c.id === id)) {
      id = `${slugify(name)}-${n}`;
      n += 1;
    }
    saveCategory({
      id,
      name,
      nameBn: newBn.trim(),
      tagline: "",
      image: "",
      subCategories: [],
      active: true,
    });
    setNewName("");
    setNewBn("");
    setCreating(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-medium text-forest-900">
          Categories
        </h2>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-5 py-2.5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
        >
          <IconPlus className="h-4 w-4" />
          {creating ? "Cancel" : "New category"}
        </button>
      </div>

      {creating && (
        <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input
              className={field}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), create())}
              placeholder="Category name (e.g. Accessories)"
              aria-label="Category name"
            />
            <input
              className={field}
              value={newBn}
              onChange={(e) => setNewBn(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), create())}
              placeholder="নাম (বাংলা, optional)"
              aria-label="Bangla name"
            />
            <button
              type="button"
              onClick={create}
              className="rounded-xl bg-forest-800 px-6 text-sm font-semibold text-ivory-50 hover:bg-forest-700"
            >
              Create
            </button>
          </div>
          <p className={hint}>The id is generated from the name (e.g. “accessories”). New categories join the demo store only after the data layer lands.</p>
        </div>
      )}

      {categories.map((c, i) => (
        <Row
          key={c.id}
          category={c}
          first={i === 0}
          last={i === categories.length - 1}
          onSave={saveCategory}
          onMove={(dir) => moveCategory(c.id, dir)}
          onToggleActive={() => setCategoryActive(c.id, c.active === false)}
        />
      ))}
    </div>
  );
}
