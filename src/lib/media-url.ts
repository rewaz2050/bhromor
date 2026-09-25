/**
 * Cloudinary source transforms (speed pass, 2026-09-25).
 *
 * `next/image` surfaces are already optimized, but the deliberate raw
 * `<img>` tags (lightbox zoom, video facades, buyer photos, admin
 * previews — data URLs, external thumbs and transform-driven zoom can't
 * use the optimizer) pull FULL-SIZE originals over mobile data. For
 * Cloudinary hosts this injects `f_auto,q_auto,w_N,c_limit` at the
 * source: modern format + capped width, straight from the CDN.
 *
 * Non-Cloudinary URLs (Drive, YouTube, data URLs, local paths) and
 * already-transformed URLs pass through untouched.
 */
export const optimizedMediaUrl = (src: string, width = 1200): string => {
  if (!src || width <= 0) return src;
  if (!src.includes("res.cloudinary.com")) return src;
  const marker = "/upload/";
  const idx = src.indexOf(marker);
  if (idx === -1) return src;
  const after = src.slice(idx + marker.length);
  const first = after.split("/")[0] ?? "";
  // Transform chains contain commas; single transforms start with a
  // parameter prefix (w_1200, f_auto…). Anything else — a v123 version
  // segment, a folder, a bare public id — gets transforms inserted.
  // (Folder names starting with w_/h_/f_/q_/c_/e_/dpr_/ar_ are
  // unsupported; the uploader uses fixed folder names.)
  if (first.includes(",") || /^(w|h|f|q|c|e|dpr|ar)_/i.test(first)) return src;
  return `${src.slice(0, idx + marker.length)}f_auto,q_auto,w_${width},c_limit/${after}`;
};
