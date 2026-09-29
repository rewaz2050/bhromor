import { NextResponse } from "next/server";
import { vendorRoute } from "../../_lib";
import { AdminInputError, createProduct, updateProduct } from "@/lib/db/admin";
import { listVendorProducts } from "@/lib/db/vendor";
import {
  parseProductCsv,
  productCsvTemplate,
  productsCsv,
  type ProductCsvRow,
} from "@/lib/product-csv";
import type { Product } from "@/lib/catalog";

export const dynamic = "force-dynamic";
export const MAX_PRODUCT_IMPORT_ROWS = 100;
export const MAX_PRODUCT_IMPORT_CHARS = 1_000_000;

/** Download this shop's bounded catalog as an Excel-friendly UTF-8 CSV. */
export const GET = vendorRoute("product-csv-export", async ({ db, shopId }, request) => {
  const template = new URL(request.url).searchParams.get("template") === "1";
  const csv = template ? productCsvTemplate() : productsCsv(await listVendorProducts(db, shopId));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${template ? "prosanti-products-template" : "prosanti-products"}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});

const jsonField = <T,>(
  value: string | undefined,
  field: string,
  fallback: T,
): T => {
  if (!value?.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new AdminInputError(`${field} must contain valid JSON.`, 422);
  }
};

/** Taka text (at most two decimals) to integer paisa, without float drift. */
const takaToPaisa = (value: string | undefined, field: string): number => {
  const raw = value?.trim() ?? "";
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    throw new AdminInputError(`${field} must be a non-negative amount in taka (up to 2 decimals).`, 422);
  }
  const [whole, fraction = ""] = raw.split(".");
  const paisa = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(paisa) || paisa > 100_000_000_000) {
    throw new AdminInputError(`${field} is too large.`, 422);
  }
  return paisa;
};

const numberField = (
  value: string | undefined,
  field: string,
  fallback?: number,
): number | undefined => {
  const raw = value?.trim() ?? "";
  if (raw === "" && fallback !== undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new AdminInputError(`${field} must be a whole number.`, 422);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n > 1_000_000) {
    throw new AdminInputError(`${field} is too large.`, 422);
  }
  return n;
};

const productBody = (
  row: Partial<ProductCsvRow>,
  existing?: Product,
): Record<string, unknown> => {
  const sku = row.sku?.trim() || existing?.sku || "";
  const name = row.name?.trim() || existing?.name || "";
  const category = row.category_id?.trim() || existing?.category || "";
  if (!sku) throw new AdminInputError("SKU is required.", 422);
  if (!name) throw new AdminInputError("Name is required.", 422);
  if (!category) throw new AdminInputError("category_id is required.", 422);

  const description = row.description?.trim();
  const media = jsonField<{ src: string; alt?: string; kind?: "image" | "video" }[]>(
    row.media_json,
    "media_json",
    existing?.media ?? [],
  );
  const colors = jsonField<string[]>(row.colors_json, "colors_json", existing?.colors ?? []);
  const sizes = jsonField<string[]>(row.sizes_json, "sizes_json", existing?.sizes ?? []);
  const details = jsonField<{ label: string; value: string }[]>(
    row.details_json,
    "details_json",
    existing?.details ?? [],
  );
  const sizeStock = jsonField<Record<string, number>>(
    row.size_stock_json,
    "size_stock_json",
    existing?.sizeStock ?? {},
  );

  return {
    name,
    nameBn: row.name_bn?.trim() || existing?.nameBn || "",
    sku,
    slug: row.slug?.trim() || existing?.slug || undefined,
    category,
    subCategory: row.subcategory?.trim() || existing?.subCategory || "",
    price: row.price_tk?.trim() ? takaToPaisa(row.price_tk, "price_tk") : existing?.price,
    compareAtPrice: row.compare_at_tk?.trim()
      ? takaToPaisa(row.compare_at_tk, "compare_at_tk")
      : existing?.compareAtPrice ?? null,
    shortDescription: row.short_description?.trim() || existing?.shortDescription || "",
    description: description ? description.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean) : existing?.description ?? [],
    details,
    colors,
    sizes,
    sizeStock,
    stock: row.stock?.trim() ? numberField(row.stock, "stock") : existing?.stock,
    media,
    seo: {
      title: row.seo_title?.trim() || existing?.seo?.title || "",
      description: row.seo_description?.trim() || existing?.seo?.description || "",
    },
    warrantyDays: row.warranty_days?.trim()
      ? numberField(row.warranty_days, "warranty_days")
      : existing?.warrantyDays ?? null,
    fabricGsm: row.fabric_gsm?.trim()
      ? numberField(row.fabric_gsm, "fabric_gsm")
      : existing?.fabricGsm ?? null,
    manufacturer: row.manufacturer?.trim() || existing?.manufacturer || "",
    testReportUrl: row.test_report_url?.trim() || existing?.testReportUrl || "",
    qualityChecked: row.quality_checked?.trim()
      ? row.quality_checked.trim().toLowerCase() === "true"
      : existing?.qualityChecked ?? false,
  };
};

/**
 * Import at most 100 rows. SKU is the shop's stable key: an SKU already in
 * THIS shop updates that piece; a new SKU creates a draft. Platform-owned
 * curation and publication status are never changed by a CSV.
 */
export const POST = vendorRoute(
  "product-csv-import",
  async ({ db, shopId }, request) => {
    const body: unknown = await request.json().catch(() => null);
    const csv = (body as { csv?: unknown } | null)?.csv;
    if (typeof csv !== "string" || csv.trim() === "") {
      throw new AdminInputError("Choose a CSV file first.", 422);
    }
    if (csv.length > MAX_PRODUCT_IMPORT_CHARS) {
      throw new AdminInputError("CSV is too large — maximum 1 MB.", 413);
    }
    const parsed = parseProductCsv(csv);
    if (parsed.errors.length > 0) {
      return NextResponse.json({ imported: 0, updated: 0, failed: parsed.errors }, { status: 422 });
    }
    if (parsed.rows.length === 0) throw new AdminInputError("CSV contains no product rows.", 422);
    if (parsed.rows.length > MAX_PRODUCT_IMPORT_ROWS) {
      throw new AdminInputError(`Import up to ${MAX_PRODUCT_IMPORT_ROWS} products at a time.`, 413);
    }

    const existing = await listVendorProducts(db, shopId);
    const bySku = new Map(existing.map((product) => [product.sku.toLowerCase(), product]));
    let imported = 0;
    let updated = 0;
    const failed: { line: number; message: string }[] = [];

    for (const record of parsed.rows) {
      const row = record.values;
      try {
        const sku = row.sku?.trim() ?? "";
        const current = bySku.get(sku.toLowerCase());
        const input = productBody(row, current);
        if (current) {
          const product = await updateProduct(db, current.id, input);
          bySku.set(product.sku.toLowerCase(), product);
          updated += 1;
        } else {
          // Import never publishes a new product. The vendor can review its
          // photos, size grid and price in the normal editor before publishing.
          const product = await createProduct(db, { ...input, status: "draft" }, shopId);
          bySku.set(product.sku.toLowerCase(), product);
          imported += 1;
        }
      } catch (error) {
        failed.push({
          line: record.line,
          message: error instanceof AdminInputError ? error.message : "This row could not be imported.",
        });
      }
    }
    return NextResponse.json({ imported, updated, failed });
  },
  { limit: 5 },
);
