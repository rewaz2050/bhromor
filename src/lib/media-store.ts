/**
 * Media library (§49) — demo, browser-local.
 *
 * Scans every media reference actually used by the system (products,
 * categories, homepage hero, brand) and overlays admin-added entries.
 * Real uploads move to Cloudinary with the signed-upload flow (§13, §48);
 * this screen already mirrors the organisation the blueprint wants
 * (PROSANTI/products/… categories/ homepage/ brand/).
 */

import type { Category, Product } from "./catalog";
import { extractYoutubeId, youtubeThumbUrl } from "./media";

export const MEDIA_STORAGE_KEY = "prosanti.admin.media.v1";

export type MediaKind =
  | "product"
  | "category"
  | "homepage"
  | "brand"
  | "custom";

/** What the bytes are (image, playable video, YouTube link). */
export type MediaContent = "image" | "video" | "youtube";

export interface MediaItem {
  id: string;
  url: string;
  alt: string;
  label: string; // human source, e.g. “Heritage Green Panjabi · image 1”
  kind: MediaKind;
  /** Older stored rows omit this and read as "image". */
  mediaType?: MediaContent;
}

export const contentOf = (m: Pick<MediaItem, "mediaType">): MediaContent =>
  m.mediaType ?? "image";

/** Small preview URL for non-image content (YouTube thumbs). */
export const previewThumb = (m: MediaItem): string | null => {
  if (contentOf(m) !== "youtube") return null;
  const id = extractYoutubeId(m.url);
  return id ? youtubeThumbUrl(id) : null;
};

export const KIND_LABEL: Record<MediaKind, string> = {
  product: "Products",
  category: "Categories",
  homepage: "Homepage",
  brand: "Brand",
  custom: "Added",
};

export const isHttp = (url: string): boolean => /^https?:\/\//i.test(url);

export const isImgUrl = (url: string): boolean =>
  /\.(jpe?g|png|webp|gif|svg|avif)(\?.*)?$/i.test(url) ||
  /^https?:\/\/[^\s]+\.[^\s]+$/i.test(url);

/** Derive the full set of in-use media items from the live catalog. */
export const scanMedia = (
  products: Product[],
  categories: Category[],
): MediaItem[] => {
  const items: MediaItem[] = [];
  const seen = new Set<string>();
  const push = (
    url: string,
    alt: string,
    label: string,
    kind: MediaKind,
    mediaType: MediaContent = "image",
  ) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    items.push({
      id: `src:${url}`,
      url,
      alt,
      label,
      kind,
      mediaType,
    });
  };
  for (const p of products) {
    p.media.forEach((m, i) => {
      const isVideo = (m.kind ?? "image") === "video";
      push(
        m.src,
        m.alt,
        isVideo
          ? `${p.name} · video`
          : `${p.name} · image ${i + 1}${i === 0 ? " (card/hero)" : ""}`,
        "product",
        isVideo ? "video" : "image",
      );
    });
    if (p.video) {
      push(
        `https://www.youtube.com/watch?v=${p.video.youtubeId}`,
        p.video.label,
        `${p.name} · YouTube video`,
        "product",
        "youtube",
      );
    }
  }
  for (const c of categories) {
    push(c.image, c.name, `${c.name} category`, "category");
  }
  push(
    "/images/hero.jpg",
    "PROSANTI hero — premium panjabi, editorial studio light",
    "Homepage hero",
    "homepage",
  );
  push(
    "/brand/logo-emblem.png",
    "PROSANTI emblem (transparent)",
    "Brand — emblem",
    "brand",
  );
  push(
    "/brand/logo-lockup.png",
    "PROSANTI full lockup on cream",
    "Brand — lockup / social share",
    "brand",
  );
  return items;
};

export const mergeCustom = (
  base: MediaItem[],
  custom: MediaItem[],
): MediaItem[] => {
  const byUrl = new Map(base.map((m) => [m.url, m]));
  for (const c of custom) {
    if (!byUrl.has(c.url)) byUrl.set(c.url, c);
  }
  return [...byUrl.values()];
};

/* ------------------------------------------------------------------ */
/* External store                                                      */
/* ------------------------------------------------------------------ */

type Listener = () => void;

let baseCache: MediaItem[] | null = null;
let baseKey: string | null = null;
let customCache: MediaItem[] | null = null;
let loaded = false;
/** Memoised merge — useSyncExternalStore needs a stable snapshot identity. */
let mergedCache: MediaItem[] | null = null;
let mergedFrom: { base: MediaItem[]; custom: MediaItem[] } | null = null;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

export const addCustom = (
  custom: MediaItem[],
  item: Omit<MediaItem, "id" | "kind">,
): MediaItem[] => {
  if (!item.url || custom.some((c) => c.url === item.url)) return custom;
  return [...custom, { ...item, kind: "custom", id: `custom:${Date.now()}` }];
};

export const removeCustom = (custom: MediaItem[], id: string): MediaItem[] =>
  custom.filter((c) => c.id !== id);

/* ------------------------------------------------------------------ */

/** Cheap identity for the scanned catalog so the base list is rebuilt when
 *  an admin adds/removes a product image (it used to be frozen forever). */
const catalogKey = (products: Product[], categories: Category[]): string =>
  `${products.length}:${products
    .map((p) => `${p.id}#${p.media.map((m) => m.src).join(",")}`)
    .join("|")}::${categories.map((c) => `${c.id}#${c.image}`).join("|")}`;

const ensureLoaded = (
  products: Product[],
  categories: Category[],
): { base: MediaItem[]; custom: MediaItem[] } => {
  const key = catalogKey(products, categories);
  // Store-mutation helpers call this with empty lists; never let that wipe a
  // base scan that was built from the real catalog.
  const skipScan = baseCache !== null && products.length === 0 && categories.length === 0;
  if (!skipScan && (!baseCache || baseKey !== key)) {
    baseCache = scanMedia(products, categories);
    baseKey = key;
    mergedCache = null;
  }
  const base = baseCache ?? [];
  if (customCache && loaded) return { base, custom: customCache };
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(MEDIA_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MediaItem[];
        if (Array.isArray(parsed)) customCache = parsed;
      }
    } catch {
      // corrupted storage → no custom entries
    }
  }
  customCache ??= [];
  return { base, custom: customCache };
};

const persist = (custom: MediaItem[]) => {
  customCache = custom;
  mergedCache = null;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(MEDIA_STORAGE_KEY, JSON.stringify(custom));
    } catch {
      // storage unavailable — demo continues in memory
    }
  }
  notify();
};

export const subscribeMedia = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Stable (empty-ish) server snapshot — a fresh array per call looped React. */
const SERVER_SNAPSHOT: MediaItem[] = scanMedia([], []);
export const getMediaServer = (): MediaItem[] => SERVER_SNAPSHOT;

export const getMedia = (
  products: Product[],
  categories: Category[],
): MediaItem[] => {
  const { base, custom } = ensureLoaded(products, categories);
  if (
    mergedCache &&
    mergedFrom &&
    mergedFrom.base === base &&
    mergedFrom.custom === custom
  ) {
    return mergedCache;
  }
  mergedCache = mergeCustom(base, custom);
  mergedFrom = { base, custom };
  return mergedCache;
};

export const getCustomMedia = (): MediaItem[] =>
  ensureLoaded([], []).custom;

export const addMediaInStore = (
  products: Product[],
  categories: Category[],
  item: { url: string; alt: string; label: string; mediaType?: MediaContent },
) => {
  const { custom } = ensureLoaded(products, categories);
  persist(addCustom(custom, item));
};

export const removeMediaInStore = (id: string) => {
  const { custom } = ensureLoaded([], []);
  persist(removeCustom(custom, id));
};

export const resetMediaStore = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(MEDIA_STORAGE_KEY);
  }
  customCache = [];
  mergedCache = null;
  persist([]);
};
