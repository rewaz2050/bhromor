/**
 * Product sharing — "ei ta dekho" links.
 *
 * Shoppers in Sunamganj decide with family and friends on WhatsApp and
 * Facebook, so every product page offers a one-tap share. Everything here is
 * a plain URL: no SDK, no app id, no tracking parameter beyond a `utm_source`
 * so the shop can see which channel brought the visit.
 */

import type { Language } from "./translations";
import type { Product } from "./catalog";
import { formatBdt } from "./format";

export type ShareChannel = "whatsapp" | "facebook" | "copy" | "native";

/** The public page URL with a utm_source tag for the channel. */
export const shareUrl = (pageUrl: string, channel: ShareChannel): string => {
  try {
    const u = new URL(pageUrl);
    // Never leak a session/preview hash into a shared link.
    u.hash = "";
    u.searchParams.set("utm_source", channel);
    u.searchParams.set("utm_medium", "share");
    return u.toString();
  } catch {
    return pageUrl;
  }
};

/** "Heritage Green Panjabi — ৳1,890 · PROSANTI" (Bangla name first in bn). */
export const shareText = (
  product: Pick<Product, "name" | "nameBn" | "price">,
  lang: Language = "en",
): string => {
  const bn = product.nameBn?.trim();
  const name = lang === "bn" && bn ? bn : product.name;
  const lead = lang === "bn" ? "এটা দেখো" : "Have a look";
  return `${lead}: ${name} — ${formatBdt(product.price)} · PROSANTI`;
};

/** wa.me with no number → the shopper picks the contact. */
export const whatsAppShareLink = (text: string, url: string): string =>
  `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;

export const facebookShareLink = (url: string): string =>
  `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;

/** Web Share API is only usable on https + user gesture; probe once. */
export const canNativeShare = (): boolean =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";

/**
 * Copy `text` to the clipboard. Returns false when the clipboard is blocked
 * (http, old WebViews) so the UI can fall back to showing the link.
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
