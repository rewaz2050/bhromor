/**
 * Vendor catalog CSV (C7) — UTF-8 spreadsheet export and a strict, bounded
 * RFC-4180 reader. This is intentionally pure: routes and tests share the
 * exact same parser / serializer.
 *
 * `price_tk` and `compare_at_tk` are taka (not the database's paisa); lists
 * and structured fields are JSON so commas, Bangla text and embedded quotes
 * survive a spreadsheet round-trip without a private delimiter convention.
 */
import type { Product } from "./catalog";
import { csvField, csvLine } from "./csv";

export const PRODUCT_CSV_HEADERS = [
  "sku",
  "name",
  "name_bn",
  "slug",
  "category_id",
  "subcategory",
  "price_tk",
  "compare_at_tk",
  "short_description",
  "description",
  "details_json",
  "colors_json",
  "sizes_json",
  "size_stock_json",
  "stock",
  "media_json",
  "seo_title",
  "seo_description",
  "warranty_days",
  "fabric_gsm",
  "manufacturer",
  "test_report_url",
  "quality_checked",
] as const;

export type ProductCsvHeader = (typeof PRODUCT_CSV_HEADERS)[number];
export type ProductCsvRow = Record<ProductCsvHeader, string>;

export interface ProductCsvRecord {
  line: number;
  values: Partial<ProductCsvRow>;
}

export interface ProductCsvParseResult {
  headers: string[];
  rows: ProductCsvRecord[];
  errors: { line: number; message: string }[];
}

/** Spreadsheet export formula protection is reversed for our own CSV. */
const fromSpreadsheet = (value: string): string =>
  /^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value;

const records = (
  text: string,
): { rows: { line: number; cells: string[] }[]; errors: { line: number; message: string }[] } => {
  const rows: { line: number; cells: string[] }[] = [];
  const errors: { line: number; message: string }[] = [];
  let cells: string[] = [];
  let cell = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const input = text.replace(/^\uFEFF/, "");
  const pushCell = () => {
    cells.push(fromSpreadsheet(cell));
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    if (cells.some((part) => part.trim() !== "")) rows.push({ line: rowLine, cells });
    cells = [];
    rowLine = line + 1;
  };

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    if (quoted) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else {
        cell += ch;
        if (ch === "\n") line += 1;
      }
      continue;
    }
    if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === ",") {
      pushCell();
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      pushRow();
      line += 1;
      rowLine = line;
    } else {
      cell += ch;
    }
  }
  if (quoted) errors.push({ line: rowLine, message: "CSV ends inside a quoted field." });
  if (cell !== "" || cells.length > 0) pushRow();
  return { rows, errors };
};

const headerKey = (header: string): string =>
  header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const REQUIRED = ["sku", "name", "category_id", "price_tk"] as const;

export const parseProductCsv = (text: string): ProductCsvParseResult => {
  const parsed = records(text);
  if (parsed.rows.length === 0) {
    return {
      headers: [],
      rows: [],
      errors: [...parsed.errors, { line: 1, message: "CSV has no header row." }],
    };
  }
  const [headerRecord, ...body] = parsed.rows;
  const headers = headerRecord!.cells.map(headerKey);
  const errors = [...parsed.errors];
  const duplicate = headers.find((header, index) => headers.indexOf(header) !== index);
  if (duplicate) errors.push({ line: headerRecord!.line, message: `Duplicate column: ${duplicate}.` });
  for (const required of REQUIRED) {
    if (!headers.includes(required)) {
      errors.push({ line: headerRecord!.line, message: `Missing required column: ${required}.` });
    }
  }
  const rows = body.map((record) => {
    if (record.cells.length !== headers.length) {
      errors.push({
        line: record.line,
        message: `Expected ${headers.length} columns; found ${record.cells.length}.`,
      });
    }
    const values: Record<string, string> = {};
    headers.forEach((header, index) => {
      values[header] = record.cells[index] ?? "";
    });
    return { line: record.line, values: values as Partial<ProductCsvRow> };
  });
  return { headers, rows, errors };
};

const jsonCell = (value: unknown): string =>
  value === undefined || value === null ? "" : JSON.stringify(value);

export const productCsvRow = (product: Product): string =>
  csvLine([
    product.sku,
    product.name,
    product.nameBn ?? "",
    product.slug,
    product.category,
    product.subCategory,
    (product.price / 100).toFixed(2),
    product.compareAtPrice ? (product.compareAtPrice / 100).toFixed(2) : "",
    product.shortDescription,
    product.description.join("\n\n"),
    jsonCell(product.details),
    jsonCell(product.colors),
    jsonCell(product.sizes),
    jsonCell(product.sizeStock),
    product.stock ?? "",
    jsonCell(product.media),
    product.seo?.title ?? "",
    product.seo?.description ?? "",
    product.warrantyDays ?? "",
    product.fabricGsm ?? "",
    product.manufacturer ?? "",
    product.testReportUrl ?? "",
    product.qualityChecked ? "true" : "false",
  ]);

export const productsCsv = (products: readonly Product[]): string =>
  `\uFEFF${[csvLine(PRODUCT_CSV_HEADERS), ...products.map(productCsvRow)].join("\r\n")}\r\n`;

/** Empty but correctly encoded/ordered template; it does not import a demo row. */
export const productCsvTemplate = (): string => `\uFEFF${csvLine(PRODUCT_CSV_HEADERS)}\r\n`;

/** csvField is re-exported only to keep C7 helpers discoverable in tests. */
export const safeProductCsvField = csvField;
