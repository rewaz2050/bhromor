/**
 * Public canonical site URL shared by metadata, sitemap and robots files.
 *
 * Deployment owners should set NEXT_PUBLIC_SITE_URL (no trailing slash).
 * Vercel provides VERCEL_PROJECT_PRODUCTION_URL and VERCEL_URL; the first
 * is preferred because it is the stable production domain.
 */
const normalize = (v: string | undefined): string | null => {
  if (!v) return null;
  const clean = v.trim().replace(/\/+$/, "");
  if (/^https?:\/\//.test(clean)) return clean;
  // VERCEL_URL is commonly scheme-less (preview-*.vercel.app). Treat any
  // hostname as https rather than silently falling back to the default.
  if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/|$)/i.test(clean)) return `https://${clean}`;
  return null;
};

export const siteBaseUrl = (): string =>
  normalize(process.env.NEXT_PUBLIC_SITE_URL) ??
  normalize(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
  normalize(process.env.VERCEL_URL) ??
  "https://prosanti.store";

export const absoluteUrl = (path = "/"): string => {
  const base = siteBaseUrl().replace(/\/+$/, "");
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${base}${clean}`;
};
