/**
 * WhatsApp Order Assistant (P1 #15) — "WhatsApp-e message korlei order".
 *
 * BD customers decide on WhatsApp. This is a one-tap, pre-filled chat link:
 * the product (or the whole bag) is written into the message, the shop
 * confirms size/stock by chat, and the customer pays COD as usual.
 *
 * Honesty rules (same posture as the rest of the storefront):
 *   • The price in the message is the CATALOG price at the moment of the tap
 *     — the shop re-confirms; nothing here claims an order was placed.
 *   • The link only exists when the shop has a plausible BD mobile number;
 *     a chat button to nowhere is worse than none.
 *   • wa.me deep links only (no app installs, no account, no token).
 */

import type { Language } from "./translations";
import type { Product, Shop } from "./catalog";
import { formatBdt } from "./format";
import { isPlausibleBdPhone, normalizeBdPhone } from "./phone";

/** "01712345678" → "8801712345678". Null when the number is not a real BD mobile. */
export const waE164 = (phone: string | null | undefined): string | null => {
  if (!phone) return null;
  const norm = normalizeBdPhone(phone);
  return isPlausibleBdPhone(norm) ? `880${norm.slice(1)}` : null;
};

export const waLink = (
  phone: string | null | undefined,
  message: string,
): string | null => {
  const e164 = waE164(phone);
  if (!e164 || message.trim() === "") return null;
  return `https://wa.me/${e164}?text=${encodeURIComponent(message)}`;
};

/** One line of an order message — a product page pick or a bag line. */
export interface WaOrderLine {
  product: Product;
  /** "Forest Green · L" or "" / "Default" when the product has no variants. */
  variantLabel: string;
  qty: number;
}

const cleanVariant = (label: string): string => {
  const v = (label ?? "").trim();
  return v === "" || /^default$/i.test(v) ? "" : v;
};

const lineName = (line: WaOrderLine): string => {
  const v = cleanVariant(line.variantLabel);
  return v ? `${line.product.name} (${v})` : line.product.name;
};

/** The pre-filled message for a single product pick. */
export const productWaMessage = (
  line: WaOrderLine,
  shop: Pick<Shop, "name" | "phone">,
  lang: Language = "en",
): string => {
  const qty = Math.max(1, Math.floor(line.qty));
  const total = line.product.price * qty;
  const name = lineName(line);
  if (lang === "bn") {
    return [
      `আসসালামু আলাইকুম ${shop.name},`,
      `আপনাদের দোকান থেকে (PROSANTI-তে) order করতে চাই:`,
      ``,
      `• ${name} × ${qty}`,
      `• দাম: ${formatBdt(total)}`,
      ``,
      `Size আর stock confirm করে দিবেন? COD-তেই পেমেন্ট করব।`,
      `(PROSANTI website থেকে পাঠানো)`,
    ].join("\n");
  }
  return [
    `Hello ${shop.name},`,
    `I would like to order from your store (on PROSANTI):`,
    ``,
    `• ${name} x ${qty}`,
    `• Price: ${formatBdt(total)}`,
    ``,
    `Please confirm size and stock — I will pay cash on delivery.`,
    `(Sent from the PROSANTI website)`,
  ].join("\n");
};

/** The pre-filled message for a whole bag (single-shop cart). */
export const bagWaMessage = (
  lines: WaOrderLine[],
  subtotal: number,
  shop: Pick<Shop, "name" | "phone">,
  lang: Language = "en",
): string => {
  const items = lines
    .map((l) => {
      const qty = Math.max(1, Math.floor(l.qty));
      return `${lineName(l)} x ${qty} — ${formatBdt(l.product.price * qty)}`;
    })
    .map((text, i) => `${i + 1}. ${text}`);
  if (lang === "bn") {
    return [
      `আসসালামু আলাইকুম ${shop.name},`,
      `PROSANTI-তে এই bag গুলো order করতে চাই:`,
      ``,
      ...items,
      ``,
      `Subtotal: ${formatBdt(subtotal)}`,
      ``,
      `Stock confirm করে দিবেন? COD-তেই পেমেন্ট করব।`,
      `(PROSANTI website থেকে পাঠানো)`,
    ].join("\n");
  }
  return [
    `Hello ${shop.name},`,
    `I would like to order this bag (on PROSANTI):`,
    ``,
    ...items,
    ``,
    `Subtotal: ${formatBdt(subtotal)}`,
    ``,
    `Please confirm availability — I will pay cash on delivery.`,
    `(Sent from the PROSANTI website)`,
  ].join("\n");
};

/** A plain "I want to talk to this shop" opener for the shop page. */
export const shopChatMessage = (
  shop: Pick<Shop, "name">,
  lang: Language = "en",
): string =>
  lang === "bn"
    ? `আসসালামু আলাইকুম ${shop.name}, আমি PROSANTI-তে আপনার দোকান দেখছি। Size/stock নিয়ে কিছু জিজ্ঞেস করতে চাই।`
    : `Hello ${shop.name}, I'm browsing your store on PROSANTI and have a question about size/stock.`;
