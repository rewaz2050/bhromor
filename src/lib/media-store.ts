/**
 * Media library (§49) — pure helpers and the in-use scan.
 *
 * Scans every media reference actually used by the system (products,
 * categories, homepage hero, brand). Admin-added entries live in the
 * media_library table (see use-media.ts); uploads move to Cloudinary with
 * the signed-upload flow (§13, §48).
 */

import type { Category, Product } from "./catalog";
import { extractYoutubeId, youtubeThumbUrl } from "./media";

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
