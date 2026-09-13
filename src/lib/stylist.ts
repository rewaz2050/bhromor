/**
 * Stylist chat (P1 #16) — structured size/pairing Q&A + human handoff.
 *
 * PROSANTI's differentiator versus a food app is that clothes need advice:
 * "which size?", "what goes with this?", "is it actually in stock?". This
 * module keeps the advice honest:
 *
 *   • Every answer the chat shows is computed from the LIVE catalog
 *     (sizes we actually sell, products in stock, the customer's own saved
 *     body numbers) — by the same pure functions the size finder and the
 *     "complete the look" rail use. Nothing is canned, nothing is invented.
 *   • The only "person" in the chat is a real person: the shop team on
 *     WhatsApp. The handoff message carries the product (and price at the
 *     moment of the tap) plus the topic the shopper asked about, and the
 *     link only exists when the shop has a plausible BD mobile — same rule
 *     as the WhatsApp order assistant (P1 #15).
 */

import type { Product, Shop } from "./catalog";
import { formatBdt } from "./format";
import type { Language } from "./translations";

export type StylistTopic = "size" | "pairing" | "stock" | "human";

/** The question chips, in chat order. */
export const STYLIST_TOPICS: readonly StylistTopic[] = [
  "size",
  "pairing",
  "stock",
  "human",
] as const;

const TOPIC_PHRASE: Record<StylistTopic, { en: string; bn: string }> = {
  size: { en: "which size fits me", bn: "আমার কোন সাইজ বসবে" },
  pairing: {
    en: "what pairs well with this",
    bn: "এটার সাথে কী ভালো যায়",
  },
  stock: { en: "is it in stock right now", bn: "এখন কি স্টকে আছে" },
  human: {
    en: "a few questions about fit and pairing",
    bn: "ফিট আর পেয়ারিং নিয়ে কিছু জিজ্ঞেস করতে চাই",
  },
};

/**
 * The pre-filled WhatsApp message for the human handoff — the real person
 * receives the product, the catalog price at the tap, and the topic the
 * shopper asked about, so the conversation starts informed.
 */
export const stylistWaMessage = (
  product: Product,
  shop: Pick<Shop, "name">,
  lang: Language = "en",
  topic: StylistTopic | null = null,
): string => {
  const phrase = (topic && TOPIC_PHRASE[topic]) || TOPIC_PHRASE.human;
  if (lang === "bn") {
    return [
      `আসসালামু আলাইকুম ${shop.name},`,
      `PROSANTI-তে “${product.name}” দেখছি (দাম: ${formatBdt(product.price)})।`,
      `একজন স্টাইলিস্টের সাহায্য লাগবে: ${phrase.bn}।`,
      `(PROSANTI website থেকে পাঠানো)`,
    ].join("\n");
  }
  return [
    `Hello ${shop.name},`,
    `I'm looking at "${product.name}" on PROSANTI (price: ${formatBdt(product.price)}).`,
    `I'd like a stylist's help: ${phrase.en}.`,
    `(Sent from the PROSANTI website)`,
  ].join("\n");
};
