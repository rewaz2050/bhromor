/**
 * Backend environment access — one place that knows which env vars the
 * server backend needs and whether each integration is configured.
 *
 * Rules:
 * - `NEXT_PUBLIC_*` values are readable in the browser (safe by design).
 * - Service-role / API secrets are SERVER-ONLY. They must never be read
 *   from client components; route handlers and server code only.
 * - Missing keys never throw at import time — every API route degrades to
 *   an honest demo-mode response so the storefront keeps working.
 */

const nonEmpty = (value: string | undefined): string | null => {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};

const isHttpsUrl = (value: string | null): value is string => {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
};

/** Public Supabase project URL (browser-safe). Null when unconfigured. */
export const supabaseUrl = (): string | null =>
  nonEmpty(process.env.NEXT_PUBLIC_SUPABASE_URL);

/** Public anon key (browser-safe — RLS still protects data). Null when unset. */
export const supabaseAnonKey = (): string | null =>
  nonEmpty(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Service-role key — SERVER-ONLY. Bypasses RLS by design, so it must only
 * ever be used inside route handlers / server code paths.
 */
export const supabaseServiceRoleKey = (): string | null =>
  nonEmpty(process.env.SUPABASE_SERVICE_ROLE_KEY);

/** True when the browser-safe Supabase config is present and sane. */
export const isSupabaseConfigured = (): boolean => {
  const url = supabaseUrl();
  return isHttpsUrl(url) && supabaseAnonKey() !== null;
};

/** True when server-side privileged access (orders/track/seed) can run. */
export const isServiceRoleConfigured = (): boolean =>
  isSupabaseConfigured() && supabaseServiceRoleKey() !== null;

/** Public Cloudinary cloud name (appears in media URLs). */
export const cloudinaryCloudName = (): string | null =>
  nonEmpty(process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME);

/** Signed-upload credentials — SERVER-ONLY. */
export const cloudinaryApiKey = (): string | null =>
  nonEmpty(process.env.CLOUDINARY_API_KEY);

export const cloudinaryApiSecret = (): string | null =>
  nonEmpty(process.env.CLOUDINARY_API_SECRET);

/** True when the server can sign Cloudinary uploads (§48). */
export const isCloudinaryConfigured = (): boolean =>
  cloudinaryCloudName() !== null &&
  cloudinaryApiKey() !== null &&
  cloudinaryApiSecret() !== null;
