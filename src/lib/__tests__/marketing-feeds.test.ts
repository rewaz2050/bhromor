import { describe, expect, it } from "vitest";
import type { Product } from "../catalog";
import {
  META_FEED_HEADER,
  buildGoogleFeed,
  buildMetaFeed,
  feedImageUrl,
  feedPriceGoogle,
  feedPriceMeta,
  storefrontJsonLd,
} from "../marketing-feeds";

const product = (over: Partial<Product>): Product =>
  ({
    id: "p1",
    slug: "heritage-green-panjabi",
    sku: "PS-P-001",
    name: "Heritage Green Panjabi",
    nameBn: "হেরিটেজ সবুজ পাঞ্জাবি",
    category: "men",
    subCategory: "Panjabi",
    price: 149000,
    compareAtPrice: null,
    inStock: true,
    shortDescription: "Handloom cotton panjabi with karchupi collar",
    rating: 0,
    reviewCount: 0,
    isNew: false,
    featured: false,
    media: [
      { src: "/images/products/panjabi.jpg", alt: "Panjabi" },
      { src: "https://res.cloudinary.com/demo/image/upload/detail.jpg", alt: "Detail" },
      { src: "https://res.cloudinary.com/demo/video/upload/clip.mp4", alt: "", kind: "video" },
    ],
    ...over,
  }) as Product;

const ORIGIN = "https://prosanti.store";

describe("marketing feeds — Google Merchant / Meta catalog", () => {
  it("prices in BDT from paisa — two decimals for Meta, whole taka for Google", () => {
    expect(feedPriceMeta(149000)).toBe("1490.00 BDT");
    expect(feedPriceMeta(0)).toBe("0.00 BDT");
    expect(feedPriceGoogle(149099)).toBe("1491 BDT");
  });

  it("absolutizes stored media and passes Cloudinary URLs through untouched", () => {
    expect(feedImageUrl("/images/products/panjabi.jpg")).toBe(
      "https://prosanti.store/images/products/panjabi.jpg",
    );
    expect(feedImageUrl("https://res.cloudinary.com/demo/image/upload/x.jpg")).toBe(
      "https://res.cloudinary.com/demo/image/upload/x.jpg",
    );
  });

  it("Meta CSV: header first, one row per piece, video slides never become image_link", () => {
    const csv = buildMetaFeed([product({})]);
    const [header, row] = csv.split("\r\n");
    expect(header).toBe(META_FEED_HEADER);
    expect(row).toContain("p1");
    expect(row).toContain("1490.00 BDT");
    expect(row).toContain("in stock");
    expect(row).toContain("https://prosanti.store/product/heritage-green-panjabi");
    expect(header).toContain("image_link,additional_image_link,brand");
    // cover image absolute; extra image is the Cloudinary one; the video is gone
    expect(row).toContain("https://prosanti.store/images/products/panjabi.jpg");
    expect(row).toContain("https://res.cloudinary.com/demo/image/upload/detail.jpg");
    expect(row).not.toContain("clip.mp4");
    expect(row?.endsWith("PROSANTI")).toBe(true);
  });

  it("Meta CSV: quotes fields that contain commas and lists out-of-stock instead of dropping", () => {
    const csv = buildMetaFeed([
      product({
        id: "p7",
        name: "Gamcha, Red & White (pair)",
        inStock: false,
        price: 35000,
      }),
    ]);
    const [, row] = csv.split("\r\n");
    expect(row).toContain('"Gamcha, Red & White (pair)"');
    expect(row).toContain("out of stock");
    expect(row).toContain("350.00 BDT");
  });

  it("Google RSS: g: namespace fields, whole-taka price, XML-escaped text", () => {
    const xml = buildGoogleFeed(
      [product({ name: "Panjabi & Pajama <Eid> set" })],
      ORIGIN,
    );
    expect(xml).toContain('xmlns:g="http://base.google.com/ns/1.0"');
    expect(xml).toContain("<g:id>p1</g:id>");
    expect(xml).toContain("<g:price>1490 BDT</g:price>");
    expect(xml).toContain("<g:availability>in stock</g:availability>");
    expect(xml).toContain("<g:condition>new</g:condition>");
    expect(xml).toContain("<g:brand>PROSANTI</g:brand>");
    expect(xml).toContain(
      "<g:link>https://prosanti.store/product/heritage-green-panjabi</g:link>",
    );
    expect(xml).toContain(
      "<g:image_link>https://prosanti.store/images/products/panjabi.jpg</g:image_link>",
    );
    expect(xml).toContain(
      "<g:additional_image_link>https://res.cloudinary.com/demo/image/upload/detail.jpg</g:additional_image_link>",
    );
    expect(xml).toContain("Panjabi &amp; Pajama &lt;Eid&gt; set");
    expect(xml).not.toContain("clip.mp4");
    expect(xml.trimEnd().endsWith("</rss>")).toBe(true);
  });

  it("JSON-LD carries only facts the store really has — no invented address or phone", () => {
    const ld = storefrontJsonLd(ORIGIN);
    const graph = ld["@graph"] as Record<string, unknown>[];
    const org = graph.find((node) => node["@type"] === "Organization")!;
    const site = graph.find((node) => node["@type"] === "WebSite")!;
    expect(org).toMatchObject({ name: "PROSANTI", url: ORIGIN });
    expect(org["logo"]).toBe(`${ORIGIN}/icons/icon-512.png`);
    expect(org).not.toHaveProperty("telephone");
    expect(org).not.toHaveProperty("address");
    expect(site).toMatchObject({ name: "PROSANTI", url: ORIGIN });
  });
});
