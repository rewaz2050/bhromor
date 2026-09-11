/**
 * Media sources for products & the library (§13–15, §48–51).
 *
 * One place that understands every media input the staff UI accepts:
 * - Cloudinary (direct upload + hosted image/video URLs)
 * - Google Drive share links (image files + video files)
 * - YouTube watch/share/shorts links (product videos)
 * - Direct https links and local /images paths
 *
 * Client-safe: no server imports, so admin components, gallery UI and
 * route-handler validation can all share these helpers.
 */

/** Loose validation for pasted image URLs / site paths. */
export const isValidImageSrc = (src: string): boolean =>
  /^\/(?!\/)/.test(src) || /^https?:\/\/[^\s]+$/i.test(src);

/** Loose validation for any media URL / site path (image or video). */
export const isValidMediaSrc = (src: string): boolean =>
  isValidImageSrc(src);

/** Pull a YouTube video id out of any common URL form, or return the id as-is. */
export const extractYoutubeId = (input: string): string | null => {
  const v = input.trim();
  if (!v) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?(?:.*&)?v=)([\w-]{6,})/,
    /(?:youtu\.be\/)([\w-]{6,})/,
    /(?:youtube\.com\/embed\/)([\w-]{6,})/,
    /(?:youtube\.com\/shorts\/)([\w-]{6,})/,
    /(?:youtube\.com\/live\/)([\w-]{6,})/,
    /^([\w-]{6,})$/,
  ];
  for (const re of patterns) {
    const m = v.match(re);
    if (m) return m[1];
  }
  return null;
};

export const isYoutubeUrl = (src: string): boolean => {
  const v = src.trim().toLowerCase();
  return (
    v.includes("youtube.com/") ||
    v.includes("youtu.be/") ||
    v.includes("youtube-nocookie.com/")
  );
};

/** Privacy-friendly embed URL. Autoplay only after the shopper taps play. */
export const youtubeEmbedUrl = (id: string, autoplay = false): string =>
  `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?rel=0${
    autoplay ? "&autoplay=1" : ""
  }`;

/** Stable thumbnail for facades / admin previews. */
export const youtubeThumbUrl = (id: string): string =>
  `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;

/* ------------------------------------------------------------------ */
/* Google Drive                                                        */
/* ------------------------------------------------------------------ */

/**
 * Pull a Drive file id out of any common share URL form:
 * /file/d/<id>/view · /file/d/<id>/preview · /open?id=<id> ·
 * /uc?id=<id> · /thumbnail?id=<id> (also docs.google.com/uc).
 * Returns null for non-Drive input.
 */
export const extractDriveFileId = (input: string): string | null => {
  const v = input.trim();
  if (!v) return null;
  if (!/drive\.google(\.com)?\//i.test(v) && !/docs\.google(\.com)?\//i.test(v)) {
    return null;
  }
  const patterns = [
    /\/file\/d\/([A-Za-z0-9_-]{10,})/,
    /[?&]id=([A-Za-z0-9_-]{10,})/,
  ];
  for (const re of patterns) {
    const m = v.match(re);
    if (m) return m[1];
  }
  return null;
};

export const isDriveUrl = (src: string): boolean =>
  extractDriveFileId(src) !== null;

/**
 * Direct image URL for a Drive file (works when the file is shared as
 * "Anyone with the link"). The `=w…` suffix asks Google for a resized copy.
 */
export const driveDirectImageUrl = (fileId: string, width = 1600): string =>
  `https://lh3.googleusercontent.com/d/${fileId}=w${width}`;

/** Thumbnail that works for both Drive images and Drive videos. */
export const driveThumbnailUrl = (fileId: string, width = 1000): string =>
  `https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`;

/**
 * Embeddable Drive player URL — the reliable way to play a Drive video on
 * the storefront (direct download links hit virus-scan interstitials).
 */
export const drivePreviewUrl = (fileId: string): string =>
  `https://drive.google.com/file/d/${fileId}/preview`;

export const isDrivePreviewUrl = (src: string): boolean =>
  /drive\.google(\.com)?\/file\/d\/[A-Za-z0-9_-]{10,}\/preview/.test(
    src.trim(),
  );

/* ------------------------------------------------------------------ */
/* Cloudinary + direct video                                           */
/* ------------------------------------------------------------------ */

export const isCloudinaryUrl = (src: string): boolean =>
  /(^|\.)res\.cloudinary\.com\//i.test(src.trim()) ||
  src.trim().toLowerCase().includes("://res.cloudinary.com/");

/** Signed-upload folders used by /api/media/sign (allow-listed server-side). */
export const CLOUDINARY_FOLDERS = [
  "prosanti/products",
  "prosanti/categories",
  "prosanti/homepage",
  "prosanti/brand",
  "prosanti/shops",
  "prosanti/delivery-proofs",
] as const;

export type CloudinaryFolder = (typeof CLOUDINARY_FOLDERS)[number];

const VIDEO_EXTENSIONS = [
  "mp4",
  "webm",
  "mov",
  "m4v",
  "ogv",
  "avi",
  "mkv",
  "m3u8",
];

const VIDEO_EXT_RE = new RegExp(
  `\\.(${VIDEO_EXTENSIONS.join("|")})(\\?.*)?$`,
  "i",
);

/** True for mp4/webm-style URLs, Cloudinary /video/ delivery URLs and Drive previews. */
export const isVideoSrc = (src: string): boolean => {
  const v = src.trim();
  if (v === "") return false;
  if (isDrivePreviewUrl(v)) return true;
  if (/\/video\/upload\//i.test(v)) return true;
  return VIDEO_EXT_RE.test(v.split("?")[0]);
};

/**
 * Best-effort poster for a Cloudinary video delivery URL
 * (/video/upload/…/x.mp4 → /video/upload/so_auto/…/x.jpg). Returns null for
 * non-Cloudinary URLs — those render a <video preload="metadata"> instead.
 */
export const cloudinaryPoster = (src: string): string | null => {
  const v = src.trim();
  if (!isCloudinaryUrl(v) || !/\/video\/upload\//i.test(v)) return null;
  const withTransform = v.replace(
    /\/video\/upload\//i,
    "/video/upload/so_auto/",
  );
  const base = withTransform.split("?")[0].replace(/\.[a-z0-9]+$/i, ".jpg");
  return base;
};

/* ------------------------------------------------------------------ */
/* Normalise any staff-pasted input into a stored media record         */
/* ------------------------------------------------------------------ */

export type MediaKind = "image" | "video" | "youtube";
export type MediaProvider =
  | "cloudinary"
  | "drive"
  | "youtube"
  | "local"
  | "direct";

export interface NormalizedMedia {
  kind: MediaKind;
  provider: MediaProvider;
  /** The URL to store and render. */
  src: string;
  /** Small preview URL (admin grids, gallery thumbnails). */
  thumb: string | null;
  /** YouTube id or Drive file id, when applicable. */
  fileId: string | null;
  /** Short human note for the staff UI (English; UI copy is English). */
  note: string | null;
}

export interface NormalizeOptions {
  /**
   * Drive share URLs never say whether the file is an image or a video,
   * so the UI asks the staff member. Defaults to "image".
   */
  driveKind?: "image" | "video";
}

export const normalizeMediaInput = (
  raw: string,
  opts: NormalizeOptions = {},
): { ok: true; media: NormalizedMedia } | { ok: false; error: string } => {
  const v = raw.trim();
  if (v === "") return { ok: false, error: "Paste a link first." };
  if (!isValidMediaSrc(v)) {
    return {
      ok: false,
      error: "That doesn't look like a link — paste https://… or a /images path.",
    };
  }

  // 1 · Google Drive — needs the staff member's image/video choice.
  const driveId = extractDriveFileId(v);
  if (driveId) {
    if (opts.driveKind === "video") {
      return {
        ok: true,
        media: {
          kind: "video",
          provider: "drive",
          src: drivePreviewUrl(driveId),
          thumb: driveThumbnailUrl(driveId),
          fileId: driveId,
          note: "Drive video — plays in the storefront gallery. Keep the file shared as “Anyone with the link”.",
        },
      };
    }
    return {
      ok: true,
      media: {
        kind: "image",
        provider: "drive",
        src: driveDirectImageUrl(driveId),
        thumb: driveThumbnailUrl(driveId, 400),
        fileId: driveId,
        note: "Drive image — converted to a direct link. Keep the file shared as “Anyone with the link”.",
      },
    };
  }

  // 2 · YouTube — the product editor routes this to the video field.
  if (isYoutubeUrl(v)) {
    const id = extractYoutubeId(v);
    if (!id) {
      return {
        ok: false,
        error: "That doesn't look like a YouTube URL or video id.",
      };
    }
    return {
      ok: true,
      media: {
        kind: "youtube",
        provider: "youtube",
        src: v,
        thumb: youtubeThumbUrl(id),
        fileId: id,
        note: "YouTube video.",
      },
    };
  }

  // 3 · Video files (Cloudinary /video/, mp4/webm/… links, Drive previews).
  if (isVideoSrc(v)) {
    const cloudinary = isCloudinaryUrl(v);
    return {
      ok: true,
      media: {
        kind: "video",
        provider: cloudinary
          ? "cloudinary"
          : v.startsWith("/")
            ? "local"
            : "direct",
        src: v,
        thumb: cloudinary ? (cloudinaryPoster(v) ?? null) : null,
        fileId: null,
        note: cloudinary
          ? "Cloudinary video."
          : "Direct video file — Cloudinary links are the most reliable.",
      },
    };
  }

  // 4 · Everything else is treated as an image.
  const cloudinary = isCloudinaryUrl(v);
  return {
    ok: true,
    media: {
      kind: "image",
      provider: cloudinary ? "cloudinary" : v.startsWith("/") ? "local" : "direct",
      src: v,
      thumb: null,
      fileId: null,
      note: cloudinary ? "Cloudinary image." : null,
    },
  };
};
