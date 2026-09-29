import { describe, expect, it } from "vitest";
import { parseProductCsv, productCsvTemplate, productsCsv, PRODUCT_CSV_HEADERS } from "@/lib/product-csv";
import type { Product } from "@/lib/catalog";

const product = {
  id: "p1", sku: "SKU-1", name: 'Shirt, "soft"', nameBn: "শার্ট", slug: "shirt",
  category: "cat-1", subCategory: "tops", price: 125050, compareAtPrice: 150000,
  shortDescription: "Soft cotton", description: ["First line", "Second line"],
  details: [{ label: "Fabric", value: "Cotton, 100%" }], colors: ["Blue", "Red"],
  sizes: ["S", "M"], sizeStock: { S: 2, M: 3 }, stock: 5,
  media: [{ src: "https://example.com/a.jpg", alt: "Front" }],
  seo: { title: "Shirt", description: "A shirt" }, warrantyDays: 30,
  fabricGsm: 180, manufacturer: "Maker", testReportUrl: "https://example.com/test",
  qualityChecked: true, inStock: true, featured: false, isNew: false, status: "active",
  shopId: "shop-1", createdAt: 0, updatedAt: 0, unitsSold: 0,
} as unknown as Product;

describe("vendor product CSV", () => {
  it("exports UTF-8 BOM and safely quotes structured and Bangla fields", () => {
    const csv = productsCsv([product]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("শার্ট");
    expect(csv).toContain('"Shirt, ""soft"""');
    expect(csv).toContain("1250.50");
    const parsed = parseProductCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.values.name).toBe(product.name);
    expect(JSON.parse(parsed.rows[0]?.values.details_json ?? "[]")).toEqual(product.details);
  });

  it("offers a blank template with the canonical headers", () => {
    const parsed = parseProductCsv(productCsvTemplate());
    expect(parsed.headers).toEqual([...PRODUCT_CSV_HEADERS]);
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toEqual([]);
  });

  it("accepts reordered headers, CRLF, multiline fields, and spreadsheet-safe values", () => {
    const csv = '\uFEFFname,price_tk,category_id,sku,description\r\n"A shirt",12.50,c1,S1,"line one\r\nline two"\r\n';
    const parsed = parseProductCsv(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0]?.values.description).toBe("line one\r\nline two");
    const protectedCsv = productsCsv([{ ...product, name: "=2+2" } as Product]);
    expect(parseProductCsv(protectedCsv).rows[0]?.values.name).toBe("=2+2");
  });

  it("reports missing, duplicate, malformed, and unterminated CSV fields", () => {
    expect(parseProductCsv("sku,name\nA,B\n").errors.map((e) => e.message)).toContain("Missing required column: category_id.");
    expect(parseProductCsv("sku,sku,name,category_id,price_tk\nA,B,C,D,2\n").errors[0]?.message).toContain("Duplicate column");
    expect(parseProductCsv("sku,name,category_id,price_tk\nA,B,C\n").errors[0]?.message).toContain("Expected 4 columns");
    expect(parseProductCsv('sku,name,category_id,price_tk\nA,"unfinished,C,2').errors[0]?.message).toContain("inside a quoted field");
  });
});
