/**
 * Marketing feeds — the store's real catalog, reshaped for the two channels
 * that bring BD shoppers for free:
 *
 *   • /api/feed/facebook → Meta Commerce (Facebook/Instagram shop) CSV
 *   • /api/feed/google   → Google Merchant Center (free listings) RSS 2.0
 *
 * Honesty rules (same as everywhere on the storefront): only real rows,
 * real prices in BDT, real availability. A video slide is never submitted
 * as an image; pieces out of stock are listed as "out of stock" rather
 * than dropped, so Meta/Google keep their history.
 */

import type { Product } from "./catalog";
import { absoluteUrl } from "./site-url";

export const FEED_BRAND = "PROSANTI";

/** Absolute URL for a stored media src ("/images/x.jpg" or a Cloudinary URL). */
export const feedImageUrl = (src: string): string =>
  /^https?:\/\//i.test(src) ? src : absoluteUrl(src);

/** "149000 paisa" → "1490.00 BDT" (Meta) / "1490 BDT" (Google). */
export const feedPriceMeta = (paisa: number): string =>
  `${(paisa / 100).toFixed(2)} BDT`;
export const feedPriceGoogle = (paisa: number): string =>
  `${Math.round(paisa / 100)} BDT`;

/** CSV field — quote when needed, double the inner quotes. */
const csvField = (value: string): string =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** XML text node — escape the five specials. */
const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const clip = (value: string, max: number): string => {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
};

const availabilityOf = (product: Product): "in stock" | "out of stock" =>
  product.inStock ? "in stock" : "out of stock";

/** Images only (video slides never go to a shopping feed), cover first. */
const productImages = (product: Product): string[] =>
  product.media
    .filter((media) => (media.kind ?? "image") === "image")
    .map((media) => feedImageUrl(media.src));

/* ------------------------------------------------------------------ */
/* Meta Commerce (Facebook / Instagram) — CSV                          */
/* ------------------------------------------------------------------ */

export const META_FEED_HEADER = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "link",
  "image_link",
  "additional_image_link",
  "brand",
].join(",");

export const buildMetaFeed = (products: Product[]): string => {
  const rows = products.map((product) => {
    const images = productImages(product);
    const fields = [
      product.id,
      clip(product.name, 150),
      clip(product.shortDescription, 2000),
      availabilityOf(product),
      "new",
      feedPriceMeta(product.price),
      absoluteUrl(`/product/${product.slug}`),
      images[0] ?? feedImageUrl("/images/hero.jpg"),
      images.slice(1, 5).join(","),
      FEED_BRAND,
    ];
    return fields.map(csvField).join(",");
  });
  return [META_FEED_HEADER, ...rows].join("\r\n");
};

/* ------------------------------------------------------------------ */
/* Google Merchant Center (free listings) — RSS 2.0 with g: namespace  */
/* ------------------------------------------------------------------ */

export const buildGoogleFeed = (products: Product[], origin: string): string => {
  const items = products
    .map((product) => {
      const images = productImages(product);
      return [
        "    <item>",
        `      <g:id>${xmlEscape(product.id)}</g:id>`,
        `      <title>${xmlEscape(clip(product.name, 150))}</title>`,
        `      <description>${xmlEscape(clip(product.shortDescription, 2000))}</description>`,
        `      <g:link>${xmlEscape(absoluteUrl(`/product/${product.slug}`))}</g:link>`,
        `      <g:image_link>${xmlEscape(images[0] ?? feedImageUrl("/images/hero.jpg"))}</g:image_link>`,
        ...images.slice(1, 5).map(
          (src) => `      <g:additional_image_link>${xmlEscape(src)}</g:additional_image_link>`,
        ),
        `      <g:condition>new</g:condition>`,
        `      <g:availability>${availabilityOf(product)}</g:availability>`,
        `      <g:price>${feedPriceGoogle(product.price)}</g:price>`,
        `      <g:brand>${xmlEscape(FEED_BRAND)}</g:brand>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    `    <title>${xmlEscape(FEED_BRAND)}</title>`,
    `    <link>${xmlEscape(origin)}</link>`,
    "    <description>Premium panjabi, three-piece, lungi and gamcha — at your door in Sunamganj.</description>",
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
};

/* ------------------------------------------------------------------ */
/* JSON-LD — Organization + WebSite (only what is really known)        */
/* ------------------------------------------------------------------ */

export const storefrontJsonLd = (origin: string): Record<string, unknown> => ({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${origin}/#organization`,
      name: FEED_BRAND,
      url: origin,
      logo: feedImageUrl("/icons/icon-512.png"),
    },
    {
      "@type": "WebSite",
      "@id": `${origin}/#website`,
      name: FEED_BRAND,
      url: origin,
      publisher: { "@id": `${origin}/#organization` },
    },
  ],
});
