"use client";

import { useMemo, useState } from "react";
import { useMedia } from "@/lib/use-media";
import { useCatalog } from "@/lib/use-catalog";
import {
  KIND_LABEL,
  isImgUrl,
  type MediaKind,
} from "@/lib/media-store";
import { useTransientValue } from "@/lib/use-transient-value";
import { field, hint } from "@/components/admin/form-ui";
import MediaUploader from "@/components/admin/media-uploader";
import { IconCheck, IconCopy, IconPlus, IconSearch, IconTrash } from "@/components/ui/icons";

const KINDS: (MediaKind | "all")[] = ["all", "product", "category", "homepage", "brand", "custom"];

/** §49 media library — in-use scan plus the persistent “added” shelf. */
export default function AdminMediaPage() {
  const { products, categories } = useCatalog();
  const { items, add, remove, reset, live, loading, error: liveError } = useMedia(products, categories);
  const [kind, setKind] = useState<MediaKind | "all">("all");
  const [query, setQuery] = useState("");
  const [url, setUrl] = useState("");
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useTransientValue<string | null>(null, 1400);

  const visible = useMemo(
    () =>
      items.filter((m) => (kind === "all" ? true : m.kind === kind)).filter(
        (m) =>
          query.trim() === "" ||
          m.url.toLowerCase().includes(query.trim().toLowerCase()) ||
          m.label.toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [items, kind, query],
  );

  const countOf = (k: MediaKind | "all") =>
    k === "all" ? items.length : items.filter((m) => m.kind === k).length;

  const copy = async (urlToCopy: string, id: string) => {
    try {
      await navigator.clipboard.writeText(
        urlToCopy.startsWith("/") ? `https://prosanti.store${urlToCopy}` : urlToCopy,
      );
      setCopied(id);
    } catch {
      window.prompt("Copy this URL:", urlToCopy);
    }
  };

  const addOne = () => {
    const u = url.trim();
    if (!u || !isImgUrl(u)) {
      setError("Paste a full image URL — http(s) to a hosted image.");
      return;
    }
    setError(null);
    void add({ url: u, alt: alt.trim(), label: alt.trim() || "Admin added image" }).then(
      (ok) => {
        if (ok) {
          setUrl("");
          setAlt("");
        } else {
          setError(liveError ?? "Could not save the image — please try again.");
        }
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-medium text-forest-900">
            Media library
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            {live
              ? "Every image the storefront uses, plus the shared library shelf (§49)."
              : "Every image the storefront actually uses, organised the way Cloudinary will store it (§49)."}
          </p>
        </div>
        {!live && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Remove admin-added entries? In-use media stays.")) reset();
            }}
            className="rounded-full px-4 py-2 text-xs font-semibold text-ink-soft ring-1 ring-line transition-colors hover:bg-paper hover:text-forest-800"
          >
            Reset additions
          </button>
        )}
      </div>

      {liveError && (
        <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">
          {liveError}
        </p>
      )}

      {/* Direct upload → Cloudinary (§48), with add-by-URL as fallback */}
      <MediaUploader
        onUploaded={(urlToAdd, label) =>
          void add({ url: urlToAdd, alt: label, label })
        }
      />

      {/* Add by URL (§50) */}
      <div className="rounded-2xl bg-paper p-5 ring-1 ring-line">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-ink-soft">
          Add an external image
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
            {error}
          </p>
        )}
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <input
            className={field}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOne())}
            placeholder="https://…/image.jpg"
            aria-label="Image URL"
          />
          <input
            className={field}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOne())}
            placeholder="Label / alt text"
            aria-label="Label"
          />
          <button
            type="button"
            onClick={addOne}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-forest-800 px-5 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
          >
            <IconPlus className="h-4 w-4" /> Add
          </button>
        </div>
        <p className={hint}>
          Prefer the uploader above — this form is for already-hosted URLs and
          local /images paths (§13, §50).
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by section">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors ${
                kind === k
                  ? "bg-forest-800 text-ivory-50"
                  : "bg-paper text-ink-soft ring-1 ring-line hover:text-forest-800"
              }`}
            >
              {k === "all" ? "All" : KIND_LABEL[k]}
              <span className={`rounded-full px-1.5 text-[0.65rem] font-bold ${kind === k ? "bg-white/20 text-ivory-50" : "bg-ivory-100 text-ink-soft"}`}>
                {countOf(k)}
              </span>
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full max-w-56">
          <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search url or label…"
            aria-label="Search media"
            className="w-full rounded-full border-0 bg-paper py-2.5 pl-10 pr-4 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/70 focus:outline-none focus:ring-2 focus:ring-forest-600"
          />
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="rounded-2xl bg-paper py-16 text-center ring-1 ring-line">
          <p className="font-display text-lg text-forest-900">Loading the library…</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-2xl bg-paper py-16 text-center ring-1 ring-line">
          <p className="font-display text-lg text-forest-900">No media here</p>
          <p className="mt-1 text-sm text-ink-soft">
            Try another filter, or add an image above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
          {visible.map((m) => (
            <figure key={m.id} className="overflow-hidden rounded-2xl bg-paper ring-1 ring-line">
              <div className="relative aspect-square bg-ivory-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.url} alt={m.alt || m.label} className="h-full w-full object-cover" loading="lazy" />
              </div>
              <figcaption className="p-3.5">
                <span className="inline-block rounded-full bg-forest-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-forest-800">
                  {KIND_LABEL[m.kind]}
                </span>
                <p className="mt-2 line-clamp-2 text-xs font-medium leading-5 text-ink">
                  {m.label}
                </p>
                <p className="mt-1 truncate font-mono text-[0.68rem] text-ink-soft" title={m.url}>
                  {m.url}
                </p>
                <div className="mt-2.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => copy(m.url, m.id)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.7rem] font-semibold text-forest-800 ring-1 ring-forest-300 transition-colors hover:bg-forest-800 hover:text-ivory-50"
                  >
                    {copied === m.id ? <IconCheck className="h-3 w-3" /> : <IconCopy className="h-3 w-3" />}
                    {copied === m.id ? "Copied" : "Copy URL"}
                  </button>
                  {m.kind === "custom" && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("Remove this entry from the library?")) void remove(m.id);
                      }}
                      aria-label={`Remove ${m.label}`}
                      className="ml-auto rounded-full p-1.5 text-ink-soft ring-1 ring-line transition-colors hover:text-rose-700 hover:ring-rose-300"
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <p className="text-xs leading-5 text-ink-soft">
        {items.length} unique images in use. Paths mirror the planned Cloudinary
        folders: products/ · categories/ · homepage/ · brand/ (§49).
      </p>
    </div>
  );
}
