/**
 * Track link builder shared by client and server (security 2026-10-14, H3).
 *
 * Pure string work only — the HMAC itself lives in `track-token.ts`
 * (server-only). Link builders that hold a serialized `Order` append its
 * precomputed `trackToken` so the tap lands with full proof and no typing.
 */

/** `/track?id=PS-…&phone=017…[&t=…]` — token appended when one is known. */
export const trackHrefWithToken = (
  id: string,
  phone: string,
  token?: string | null,
): string => {
  const base = `/track?id=${encodeURIComponent(id)}&phone=${encodeURIComponent(phone)}`;
  const t = (token ?? "").trim();
  return t === "" ? base : `${base}&t=${encodeURIComponent(t)}`;
};

/** Same, for absolute (WhatsApp / mail) links. */
export const absoluteTrackHref = (
  absoluteUrl: (path: string) => string,
  id: string,
  phone: string,
  token?: string | null,
): string => absoluteUrl(trackHrefWithToken(id, phone, token));
