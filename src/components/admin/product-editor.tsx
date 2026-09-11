"use client";

/**
 * Product editor (§71–73) — shared by /admin/products/new and
 * /admin/products/[id]. One calm sectioned form; data lands in the catalog
 * catalog store (Supabase phase replaces only the persistence layer).
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useCatalog } from "@/lib/use-catalog";
import { nextProductId, slugify } from "@/lib/catalog-store";
import { bdt } from "@/lib/format";
import {
  driveThumbnailUrl,
  extractDriveFileId,
  extractYoutubeId,
  isDrivePreviewUrl,
  normalizeMediaInput,
  youtubeThumbUrl,
} from "@/lib/media";
import { field, hint, label } from "./form-ui";
import MediaUploader from "./media-uploader";
import { IconCheck, IconPlus, IconTrash } from "@/components/ui/icons";
import type { Product } from "@/lib/catalog";

interface Draft {
  name: string;
  nameBn: string;
  slug: string;
  slugTouched: boolean;
  sku: string;
  category: string;
  subCategory: string;
  shortDescription: string;
  descriptionText: string;
  priceTaka: string;
  compareTaka: string;
  stock: string;
  featured: boolean;
  isNew: boolean;
  status: "draft" | "published";
  active: boolean;
  colors: string[];
  colorInput: string;
  sizes: string[];
  sizeInput: string;
  media: { src: string; alt: string; kind: "image" | "video" }[];
  mediaSrc: string;
  mediaAlt: string;
  driveKind: "image" | "video";
  mediaNotice: string | null;
  youtube: string;
  youtubeLabel: string;
  seoTitle: string;
  seoDesc: string;
  error: string | null;
}

const draftFrom = (p?: Product | null): Draft => ({
  name: p?.name ?? "",
  nameBn: p?.nameBn ?? "",
  slug: p?.slug ?? "",
  slugTouched: Boolean(p?.slug),
  sku: p?.sku ?? "",
  category: p?.category ?? "",
  subCategory: p?.subCategory ?? "",
  shortDescription: p?.shortDescription ?? "",
  descriptionText: p?.description.join("\n") ?? "",
  priceTaka: p ? String(p.price / 100) : "",
  compareTaka: p?.compareAtPrice ? String(p.compareAtPrice / 100) : "",
  stock: p?.stock != null ? String(p.stock) : p ? (p.inStock ? (p.lowStock ? "3" : "12") : "0") : "",
  featured: p?.featured ?? false,
  isNew: p?.isNew ?? true,
  status: p?.status ?? "draft",
  active: p?.active ?? true,
  colors: p ? [...p.colors] : [],
  colorInput: "",
  sizes: p ? [...p.sizes] : [],
  sizeInput: "",
  media: p
    ? p.media.map((m) => ({
        src: m.src,
        alt: m.alt,
        kind: (m.kind ?? "image") as "image" | "video",
      }))
    : [],
  mediaSrc: "",
  mediaAlt: "",
  driveKind: "image",
  mediaNotice: null,
  youtube: p?.video?.youtubeId ?? "",
  youtubeLabel: p?.video?.label ?? "Watch product video",
  seoTitle: p?.seo?.title ?? "",
  seoDesc: p?.seo?.description ?? "",
  error: null,
});

export default function ProductEditor({
  product,
  categoriesList,
  products: productsProp,
  saveError: saveErrorProp,
  onSave,
  redirectTo = "/admin/products",
  hideCuration = false,
}: {
  product?: Product | null;
  categoriesList: { id: string; name: string; subCategories: string[] }[];
  /** Vendor reuse (marketplace slice 3): override the catalog source, the
   * save sink, and the post-save destination. Admin defaults unchanged. */
  products?: Product[];
  saveError?: string | null;
  onSave?: (product: Product, isNew: boolean) => Promise<boolean>;
  redirectTo?: string;
  hideCuration?: boolean;
}) {
  const router = useRouter();
  const catalog = useCatalog();
  const products = productsProp ?? catalog.products;
  const saveError = saveErrorProp ?? catalog.error;
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => ({
    ...draftFrom(product),
    category: product?.category ?? (categoriesList[0]?.id ?? ""),
  }));
  const isNew = !product;

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value, error: null }));

  const catSubs = useMemo(
    () => categoriesList.find((c) => c.id === draft.category)?.subCategories ?? [],
    [categoriesList, draft.category],
  );

  const addChip = (list: "colors" | "sizes", value: string, inputKey: "colorInput" | "sizeInput") => {
    const v = value.trim();
    if (!v) return;
    if (draft[list].some((x) => x.toLowerCase() === v.toLowerCase())) {
      set(inputKey, "");
      return;
    }
    set(list, [...draft[list], v]);
    set(inputKey, "");
  };

  const addMedia = () => {
    const result = normalizeMediaInput(draft.mediaSrc, {
      driveKind: draft.driveKind,
    });
    if (!result.ok) {
      set("error", result.error);
      return;
    }
    const media = result.media;
    if (media.kind === "youtube") {
      set(
        "error",
        "That's a YouTube link — paste it in the “YouTube video” field below instead.",
      );
      return;
    }
    if (draft.media.some((m) => m.src === media.src)) {
      set("error", "That media is already added.");
      return;
    }
    // YouTube was routed out above — only image/video reach the gallery list.
    const kind: "image" | "video" = media.kind;
    setDraft((d) => ({
      ...d,
      media: [...d.media, { src: media.src, alt: d.mediaAlt.trim(), kind }],
      mediaSrc: "",
      mediaAlt: "",
      mediaNotice: media.note,
      error: null,
    }));
  };

  const moveMediaFirst = (index: number) => {
    setDraft((d) => {
      if (index <= 0 || index >= d.media.length) return d;
      const next = [...d.media];
      const [row] = next.splice(index, 1);
      return { ...d, media: [row, ...next], error: null };
    });
  };

  const validate = (): string | null => {
    if (!draft.name.trim()) return "Product name is required.";
    const taka = Number(draft.priceTaka);
    if (!draft.priceTaka.trim() || !Number.isFinite(taka) || taka <= 0)
      return "Enter a valid price.";
    // A non-numeric "compare at" used to be saved as NaN and rendered as ৳NaN.
    if (draft.compareTaka.trim()) {
      const compare = Number(draft.compareTaka);
      if (!Number.isFinite(compare) || compare <= 0)
        return "Compare-at price must be a number.";
      if (compare <= taka)
        return "Compare-at price should be higher than the selling price.";
    }
    if (draft.stock.trim() && !Number.isFinite(Number(draft.stock)))
      return "Stock must be a number.";
    if (!draft.category) return "Pick a category.";
    if (draft.media.length === 0) return "Add at least one product image.";
    if (!draft.media.some((m) => m.kind === "image")) {
      return "Add at least one photo — videos can't be the card cover.";
    }
    if (draft.media[0].kind !== "image") {
      return "The first media must be a photo — use “Cover” on an image row.";
    }
    // Duplicate slugs silently broke /product/[slug] (two rows, one URL).
    const slug = slugify(draft.slug || draft.name);
    const clash = products.find((p) => p.slug === slug && p.id !== product?.id);
    if (clash) return `The URL slug “${slug}” is already used by ${clash.name}.`;
    const sku = draft.sku.trim().toUpperCase();
    if (sku) {
      const skuClash = products.find(
        (p) => p.sku.toUpperCase() === sku && p.id !== product?.id,
      );
      if (skuClash) return `SKU “${sku}” already belongs to ${skuClash.name}.`;
    }
    const ytId = extractYoutubeId(draft.youtube);
    if (draft.youtube.trim() && !ytId) return "That doesn't look like a YouTube URL or video id.";
    return null;
  };

  const save = async () => {
    const problem = validate();
    if (problem) {
      set("error", problem);
      return;
    }
    const stock = Math.max(0, Math.floor(Number(draft.stock) || 0));
    const existing = product;
    const now: Product = {
      id: existing?.id ?? nextProductId(products),
      slug: slugify(draft.slug || draft.name),
      // Empty SKUs showed as "SKU " in the cart — derive a sensible one.
      sku:
        draft.sku.trim().toUpperCase() ||
        `PS-${slugify(draft.slug || draft.name).slice(0, 12).toUpperCase()}`,
      name: draft.name.trim(),
      nameBn: draft.nameBn.trim() || undefined,
      category: draft.category as Product["category"],
      subCategory: draft.subCategory.trim() || (catSubs[0] ?? "General"),
      price: bdt(Number(draft.priceTaka)),
      compareAtPrice: draft.compareTaka.trim()
        ? bdt(Number(draft.compareTaka))
        : undefined,
      shortDescription: draft.shortDescription.trim(),
      description: draft.descriptionText
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean),
      details: existing?.details ?? [],
      colors: draft.colors,
      sizes: draft.sizes,
      featured: draft.featured,
      isNew: draft.isNew,
      inStock: stock > 0,
      lowStock: stock > 0 && stock <= 5,
      stock,
      media: draft.media.filter((m) => m.src.trim()),
      video: extractYoutubeId(draft.youtube)
        ? { youtubeId: extractYoutubeId(draft.youtube)!, label: draft.youtubeLabel.trim() || "Watch product video" }
        : undefined,
      rating: existing?.rating ?? 0,
      reviewCount: existing?.reviewCount ?? 0,
      status: draft.status,
      active: draft.active,
      seo: {
        title: draft.seoTitle.trim() || undefined,
        description: draft.seoDesc.trim() || undefined,
      },
    };
    // keep the previous badge when one exists; derive a fresh one for new rows
    if (existing?.badge) now.badge = existing.badge;
    else if (now.isNew) now.badge = "new";
    else if (now.compareAtPrice) now.badge = "sale";

    // Await the save: in live mode it is a network write, and navigating
    // first would strand the editor on a failure with no message.
    setSaving(true);
    const ok = onSave ? await onSave(now, isNew) : await catalog.saveProduct(now);
    setSaving(false);
    if (!ok) {
      setDraft((d) => ({ ...d, error: saveError ?? "Could not save the product." }));
      return;
    }
    router.push(redirectTo);
    router.refresh();
  };

  const blockCls = "rounded-2xl bg-paper p-6 ring-1 ring-line";

  return (
    <div className="max-w-3xl space-y-6">
      {draft.error && (
        <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200">
          {draft.error}
        </p>
      )}

      {/* 1 · Basics */}
      <section aria-label="Basic information" className={blockCls}>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          1 · Basic information (§71)
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={label}>Product name *</span>
            <input
              className={field}
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  name: e.target.value,
                  slug: d.slugTouched ? d.slug : slugify(e.target.value),
                }))
              }
              placeholder="e.g. Moss Green Panjabi"
            />
          </label>
          <label className="block">
            <span className={label}>Slug</span>
            <input
              className={field}
              value={draft.slug}
              onChange={(e) => setDraft((d) => ({ ...d, slug: slugify(e.target.value), slugTouched: true }))}
              placeholder="moss-green-panjabi"
            />
            <span className={hint}>Clean URLs only — auto-generated from the name (§52).</span>
          </label>
          <label className="block">
            <span className={label}>SKU</span>
            <input className={field} value={draft.sku} onChange={(e) => set("sku", e.target.value)} placeholder="PS-MN-008" />
          </label>
          <label className="block">
            <span className={label}>Category *</span>
            <select
              className={field}
              value={draft.category}
              onChange={(e) => {
                const cat = categoriesList.find((c) => c.id === e.target.value);
                setDraft((d) => ({
                  ...d,
                  category: e.target.value,
                  subCategory: d.subCategory || (cat?.subCategories[0] ?? ""),
                }));
              }}
            >
              <option value="">Select…</option>
              {categoriesList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={label}>Subcategory</span>
            <input
              className={field}
              value={draft.subCategory}
              list="product-subs"
              onChange={(e) => set("subCategory", e.target.value)}
              placeholder="e.g. Panjabi"
            />
            <datalist id="product-subs">
              {catSubs.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Short description</span>
            <textarea
              className={`${field} min-h-20 resize-y`}
              value={draft.shortDescription}
              onChange={(e) => set("shortDescription", e.target.value)}
              placeholder="One or two lines shown on the product card."
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Description (blank line = new paragraph)</span>
            <textarea
              className={`${field} min-h-28 resize-y`}
              value={draft.descriptionText}
              onChange={(e) => set("descriptionText", e.target.value)}
              placeholder="Tell the product's story…"
            />
          </label>
        </div>
      </section>

      {/* 2 · Pricing */}
      <section aria-label="Pricing" className={blockCls}>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          2 · Pricing
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Price (৳) *</span>
            <input
              className={field}
              type="number"
              min="0"
              step="1"
              value={draft.priceTaka}
              onChange={(e) => set("priceTaka", e.target.value)}
              placeholder="1490"
            />
          </label>
          <label className="block">
            <span className={label}>Compare-at price (৳) — optional</span>
            <input
              className={field}
              type="number"
              min="0"
              step="1"
              value={draft.compareTaka}
              onChange={(e) => set("compareTaka", e.target.value)}
              placeholder="1790"
            />
            <span className={hint}>Shown struck-through to signal a sale.</span>
          </label>
        </div>
      </section>

      {/* 3 · Variants & inventory */}
      <section aria-label="Variants and inventory" className={blockCls}>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          3 · Variants & inventory (§17, §57)
        </h3>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <div>
            <span className={label}>Colours</span>
            <div className="flex flex-wrap gap-2">
              {draft.colors.map((c) => (
                <span key={c} className="inline-flex items-center gap-1.5 rounded-full bg-ivory-100 px-3 py-1.5 text-xs font-medium text-ink">
                  {c}
                  <button
                    type="button"
                    aria-label={`Remove ${c}`}
                    onClick={() => set("colors", draft.colors.filter((x) => x !== c))}
                    className="text-ink-soft hover:text-rose-600"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                className={field}
                value={draft.colorInput}
                onChange={(e) => set("colorInput", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChip("colors", draft.colorInput, "colorInput");
                  }
                }}
                placeholder="Forest Green"
              />
              <button
                type="button"
                onClick={() => addChip("colors", draft.colorInput, "colorInput")}
                aria-label="Add colour"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest-800 text-ivory-50 hover:bg-forest-700"
              >
                <IconPlus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div>
            <span className={label}>Sizes</span>
            <div className="flex flex-wrap gap-2">
              {draft.sizes.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-ivory-100 px-3 py-1.5 text-xs font-medium text-ink">
                  {s}
                  <button
                    type="button"
                    aria-label={`Remove ${s}`}
                    onClick={() => set("sizes", draft.sizes.filter((x) => x !== s))}
                    className="text-ink-soft hover:text-rose-600"
                  >
                    <IconTrash className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                className={field}
                value={draft.sizeInput}
                onChange={(e) => set("sizeInput", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChip("sizes", draft.sizeInput, "sizeInput");
                  }
                }}
                placeholder="M"
              />
              <button
                type="button"
                onClick={() => addChip("sizes", draft.sizeInput, "sizeInput")}
                aria-label="Add size"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-forest-800 text-ivory-50 hover:bg-forest-700"
              >
                <IconPlus className="h-4 w-4" />
              </button>
            </div>
          </div>
          <label className="block sm:col-span-2">
            <span className={label}>Stock quantity</span>
            <input
              className={`${field} max-w-40`}
              type="number"
              min="0"
              step="1"
              value={draft.stock}
              onChange={(e) => set("stock", e.target.value)}
            />
            <span className={hint}>0 = out of stock; 1–5 triggers the low-stock badge (§58).</span>
          </label>
        </div>
      </section>

      {/* 4 · Media */}
      <section aria-label="Media" className={blockCls}>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          4 · Media (§13–15)
        </h3>
        <div className="mt-4 space-y-3">
          {draft.mediaNotice && (
            <p role="status" className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
              {draft.mediaNotice}
            </p>
          )}
          {draft.media.map((m, i) => {
            const driveId =
              m.kind === "video" && isDrivePreviewUrl(m.src)
                ? extractDriveFileId(m.src)
                : null;
            return (
              <div key={`${m.src}-${i}`} className="flex items-center gap-3 rounded-xl bg-ivory-100/70 px-3 py-2.5">
                <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-ivory-100 ring-1 ring-line">
                  {m.kind === "image" ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={m.src} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : driveId ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={driveThumbnailUrl(driveId, 200)} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <video src={m.src} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  )}
                  {m.kind === "video" && (
                    <span className="absolute inset-0 flex items-center justify-center bg-forest-950/30 text-[0.6rem] font-bold text-ivory-50" aria-hidden="true">
                      ▶
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink-soft">#{i + 1}</span>
                    {i === 0 && (
                      <span className="rounded-full bg-forest-800 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-ivory-50">
                        Cover
                      </span>
                    )}
                    {m.kind === "video" && (
                      <span className="rounded-full bg-gold-200/70 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-forest-900">
                        Video
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-sm text-ink" title={m.src}>{m.src}</span>
                </span>
                {m.kind === "image" && i > 0 && (
                  <button
                    type="button"
                    onClick={() => moveMediaFirst(i)}
                    title="Make this the cover photo"
                    className="shrink-0 rounded-full px-3 py-1.5 text-[0.7rem] font-semibold text-forest-800 ring-1 ring-forest-300 transition-colors hover:bg-forest-800 hover:text-ivory-50"
                  >
                    Cover
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Remove ${m.kind} ${i + 1}`}
                  onClick={() => set("media", draft.media.filter((_, j) => j !== i))}
                  className="shrink-0 rounded-full p-2 text-ink-soft transition-colors hover:bg-paper hover:text-rose-600"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-forest-50 px-3.5 py-3 ring-1 ring-forest-100">
            <MediaUploader
              compact
              onUploaded={(urlToAdd, labelToAdd, kindAdded) => {
                if (kindAdded === "youtube") return;
                setDraft((d) =>
                  d.media.some((m) => m.src === urlToAdd)
                    ? d
                    : {
                        ...d,
                        media: [
                          ...d.media,
                          { src: urlToAdd, alt: labelToAdd, kind: kindAdded },
                        ],
                        mediaNotice:
                          kindAdded === "video"
                            ? "Video uploaded to Cloudinary — it will play in the gallery."
                            : "Image uploaded to Cloudinary.",
                        error: null,
                      },
                );
              }}
            />
            <p className="text-xs text-ink-soft">
              …or paste a link below — Cloudinary, Drive or direct file.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <input
              className={field}
              value={draft.mediaSrc}
              onChange={(e) => set("mediaSrc", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMedia())}
              placeholder="Paste image/video link (Cloudinary / Drive / https://…)"
              aria-label="Image or video URL"
            />
            <input
              className={field}
              value={draft.mediaAlt}
              onChange={(e) => set("mediaAlt", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addMedia())}
              placeholder="Alt text (optional)"
              aria-label="Alt text"
            />
            <button
              type="button"
              onClick={addMedia}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-forest-800 px-4 text-sm font-semibold text-ivory-50 hover:bg-forest-700"
            >
              <IconPlus className="h-4 w-4" /> Add
            </button>
          </div>
          {extractDriveFileId(draft.mediaSrc) !== null && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="This Drive file is">
              <span className="text-xs font-medium text-ink-soft">This Drive link is:</span>
              {(["image", "video"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => set("driveKind", k)}
                  aria-pressed={draft.driveKind === k}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    draft.driveKind === k
                      ? "bg-forest-800 text-ivory-50"
                      : "bg-white text-ink-soft ring-1 ring-line hover:text-forest-800"
                  }`}
                >
                  {k === "image" ? "A photo" : "A video"}
                </button>
              ))}
            </div>
          )}
          <p className={hint}>
            The cover photo (#1) shows on cards, search and checkout. Extra
            photos and videos play inside the gallery on the product page.
            Drive files must stay shared as “Anyone with the link”.
          </p>

          <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-2">
            <div>
              <label className="block">
                <span className={label}>YouTube video (optional)</span>
                <input
                  className={field}
                  value={draft.youtube}
                  onChange={(e) => set("youtube", e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=…"
                />
              </label>
              {extractYoutubeId(draft.youtube) && (
                <span className="mt-2 flex items-center gap-2.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={youtubeThumbUrl(extractYoutubeId(draft.youtube)!)}
                    alt=""
                    className="h-10 w-[4.5rem] rounded-lg object-cover ring-1 ring-line"
                    loading="lazy"
                  />
                  <span className="text-xs font-medium text-emerald-700">
                    Video found — it will play in the gallery.
                  </span>
                </span>
              )}
              <span className={hint}>Watch, Shorts, share and live links all work — the player loads only when tapped (§51).</span>
            </div>
            <label className="block">
              <span className={label}>Video label</span>
              <input
                className={field}
                value={draft.youtubeLabel}
                onChange={(e) => set("youtubeLabel", e.target.value)}
                placeholder="Watch product video"
              />
            </label>
          </div>
        </div>
      </section>

      {/* 5 · Publishing, SEO */}
      <section aria-label="Publishing and SEO" className={blockCls}>
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          5 · Publishing & SEO (§52, §73)
        </h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <span className={label}>State</span>
            <div className="flex gap-2">
              {(["draft", "published"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set("status", s)}
                  aria-pressed={draft.status === s}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-sm font-semibold ring-1 transition-colors ${
                    draft.status === s
                      ? "bg-forest-800 text-ivory-50 ring-forest-800"
                      : "bg-white text-ink-soft ring-line hover:text-forest-800"
                  }`}
                >
                  {s === "draft" ? "Draft" : "Published"}
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(e) => set("active", e.target.checked)}
                className="h-4 w-4 rounded accent-forest-700"
              />
              Active in catalog (uncheck to archive — orders keep history §74)
            </label>
          </div>
          {!hideCuration && (
            <div>
              <span className={label}>Badges</span>
              <div className="flex gap-2">
                <label className="flex flex-1 items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-sm text-ink ring-1 ring-line">
                  <input
                    type="checkbox"
                    checked={draft.isNew}
                    onChange={(e) => set("isNew", e.target.checked)}
                    className="h-4 w-4 rounded accent-forest-700"
                  />
                  New arrival
                </label>
                <label className="flex flex-1 items-center gap-2.5 rounded-xl bg-white px-3 py-2.5 text-sm text-ink ring-1 ring-line">
                  <input
                    type="checkbox"
                    checked={draft.featured}
                    onChange={(e) => set("featured", e.target.checked)}
                    className="h-4 w-4 rounded accent-gold-600"
                  />
                  Featured
                </label>
              </div>
            </div>
          )}
          <label className="block sm:col-span-2">
            <span className={label}>SEO title (optional)</span>
            <input
              className={field}
              value={draft.seoTitle}
              onChange={(e) => set("seoTitle", e.target.value)}
              placeholder={`${draft.name || "Product"} — PROSANTI`}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>Meta description (optional)</span>
            <textarea
              className={`${field} min-h-16 resize-y`}
              value={draft.seoDesc}
              onChange={(e) => set("seoDesc", e.target.value)}
              placeholder="A short, honest summary for search engines and shared links."
            />
          </label>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3 pt-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-full bg-forest-800 px-7 py-3 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
        >
          <IconCheck className="h-4 w-4" />
          {saving ? "Saving…" : isNew ? "Create product" : "Save changes"}
        </button>
        <button
          type="button"
          onClick={() => {
            router.push("/admin/products");
          }}
          className="rounded-full px-6 py-3 text-sm font-medium text-ink-soft ring-1 ring-line transition-colors hover:bg-paper hover:text-forest-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
