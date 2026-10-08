/**
 * The server read behind the contact channels (flicker pass 2026-10-07).
 *
 * The contact page used to render "use the message form" and then, once
 * /api/contact answered, replace it with one to three channel cards — the
 * whole column below jumped. The page is a server component: it reads this
 * itself and paints the real channels in the first byte.
 *
 * Cached like every other public ops read (`CACHE_TAG_OPS`, one minute) so
 * the page costs no extra round trip, and a staff edit still shows on the
 * next request (`revalidateCatalogCaches(CACHE_TAG_OPS)`).
 */

import "server-only";

import { unstable_cache } from "next/cache";
import { isServiceRoleConfigured } from "../env";
import { getSupabaseService } from "../supabase-server";
import { CACHE_TAG_OPS, PUBLIC_CACHE_SECONDS } from "../public-cache";
import { NO_CONTACT, shapeContact, type ContactInfo } from "../contact";

const read = async (): Promise<ContactInfo | null> => {
  if (!isServiceRoleConfigured()) return null;
  const db = getSupabaseService();
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("site_settings")
      .select("value")
      .eq("key", "ops")
      .maybeSingle();
    // Null = "the shop has not told us", which the page renders as the
    // message form — never a placeholder number.
    if (error || !data) return null;
    return shapeContact((data as { value: unknown }).value);
  } catch {
    return null;
  }
};

const cached = unstable_cache(async () => read(), ["contact-channels-v1"], {
  revalidate: PUBLIC_CACHE_SECONDS,
  tags: [CACHE_TAG_OPS],
});

/** Null when the backend is unreachable or the shop has configured nothing. */
export const readContactChannels = async (): Promise<ContactInfo | null> => {
  try {
    return await cached();
  } catch {
    return read();
  }
};

export { NO_CONTACT };
