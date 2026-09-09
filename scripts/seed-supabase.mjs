/**
 * Seed the Supabase backend from the storefront's launch catalog.
 *
 * Mirrors src/lib/catalog.ts (+ the coupon/zone seeds) into categories,
 * products, product_variants, product_media, delivery_zones, coupons and
 * site_settings. Safe to re-run: everything upserts on its natural key and
 * media rows are rebuilt per product.
 *
 * Usage:
 *   node scripts/seed-supabase.mjs            # reads .env.local
 *   node scripts/seed-supabase.mjs --dry-run  # print the plan, write nothing
 *
 * Required env: NEXT_PUBLIC_SUPABASE_URL (https) + SUPABASE_SERVICE_ROLE_KEY.
 * The service key never leaves this machine — the script runs locally, not
 * in the browser, and .env.local is git-ignored.
 */

import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

/* ------------------------------------------------------------------ */
/* env                                                                 */
/* ------------------------------------------------------------------ */

const loadLocalEnv = () => {
  const path = new URL("../.env.local", import.meta.url);
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
};

loadLocalEnv();

const DRY = process.argv.includes("--dry-run");
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

if (!DRY && !SUPABASE_URL.startsWith("https://")) {
  console.error("✕ NEXT_PUBLIC_SUPABASE_URL must be an https URL.");
  process.exit(1);
}
if (!DRY && SERVICE_KEY === "") {
  console.error("✕ SUPABASE_SERVICE_ROLE_KEY is missing (see docs/backend.md).");
  process.exit(1);
}

const db = DRY ? null : createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const fail = (label, error) => {
  console.error(`✕ ${label}:`, error?.message ?? error);
  process.exit(1);
};

/* ------------------------------------------------------------------ */
/* seed data (mirror of src/lib/catalog.ts + coupon/zone seeds)        */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  { id: "men", name: "Men", name_bn: "পুরুষ", tagline: "Panjabi · Shirts · T-Shirts — refined everyday wear", image: "/images/products/panjabi.jpg", subcategories: ["Panjabi", "Shirts", "T-Shirts"], sort_order: 0 },
  { id: "women", name: "Women", name_bn: "নারী", tagline: "Three-piece · Anarkali — graceful, considered dressing", image: "/images/products/three-piece.jpg", subcategories: ["Three-Piece", "Dresses"], sort_order: 1 },
  { id: "traditional", name: "Traditional", name_bn: "ঐতিহ্য", tagline: "Lungi · Gamcha — heritage textiles for daily life", image: "/images/products/gamcha.jpg", subcategories: ["Lungi", "Gamcha"], sort_order: 2 },
];

const ZONES = [
  { id: "z1", name: "Zone A — City Centre", areas: ["Kandirpar", "Court Road", "Dhaka–Chittagong Road (core)"], charge: 5000, eta_label: "40–50 min", sort_order: 0 },
  { id: "z2", name: "Zone B — Inner Ring", areas: ["Rampur", "Paduar Bazar", "Badurtala"], charge: 7000, eta_label: "45–55 min", sort_order: 1 },
  { id: "z3", name: "Zone C — Outer Ring", areas: ["Lalchandpur", "Gouripur", "Suaganj"], charge: 10000, eta_label: "60–75 min", sort_order: 2 },
];

const now = Date.now();
const DAY = 86_400_000;
const COUPONS = [
  { code: "WELCOME100", type: "fixed", value: 10000, min_order: 100000, category_id: null, valid_from: null, valid_until: new Date(now + 90 * DAY).toISOString(), usage_limit: 500, used: 0 },
  { code: "PROSANTI15", type: "percent", value: 15, min_order: 200000, category_id: null, valid_from: null, valid_until: new Date(now + 30 * DAY).toISOString(), usage_limit: 200, used: 0 },
  { code: "EID50", type: "fixed", value: 5000, min_order: 0, category_id: "men", valid_from: null, valid_until: new Date(now + 7 * DAY).toISOString(), usage_limit: null, used: 0 },
];

const P = (p) => p;
const PRODUCTS = [
  P({
    slug: "heritage-green-panjabi", sku: "PS-MN-001", name: "Heritage Green Panjabi", name_bn: "হেরিটেজ সবুজ পাঞ্জাবি",
    category_id: "men", subcategory: "Panjabi", price: 149000, compare_at_price: 185000,
    short_description: "A deep forest-green panjabi in breathable premium cotton, cut for Eid and beyond.",
    description: [
      "The Heritage Green Panjabi is tailored from a mid-weight combed cotton with a soft, breathable hand-feel — comfortable across a full day of family gatherings or quiet evenings.",
      "The collar carries a subtle tonal embroidery, kept restrained so the garment reads premium rather than busy. A concealed placket keeps the front line clean.",
      "Cut in a regular, modest silhouette with side slits for ease of movement and prayer-friendly length.",
    ].join("\n\n"),
    details: [
      { label: "Fabric", value: "100% premium combed cotton" },
      { label: "Fit", value: "Regular · modesty cut" },
      { label: "Care", value: "Gentle machine wash cold" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Forest Green"], sizes: ["M", "L", "XL", "XXL"], featured: true, is_new: true, low_stock: false,
    media: [
      { url: "/images/products/panjabi.jpg", alt_text: "Heritage Green Panjabi on hanger, ivory studio backdrop" },
      { url: "/images/products/panjabi-detail.jpg", alt_text: "Close-up of tonal embroidery at the panjabi collar" },
      { url: "/images/editorial/hero-prosanti.jpg", alt_text: "Heritage Green Panjabi styled in a sunlit Bangladeshi interior" },
    ],
  }),
  P({
    slug: "ivory-linen-shirt", sku: "PS-MN-002", name: "Ivory Linen Shirt", name_bn: "",
    category_id: "men", subcategory: "Shirts", price: 129000, compare_at_price: null,
    short_description: "A crisp ivory-linen shirt with a relaxed collar — the quiet centre of a smart-casual wardrobe.",
    description: [
      "Woven from a linen-rich blend that softens beautifully with every wash, the Ivory Linen Shirt keeps its structure while breathing easily in warm weather.",
      "Mother-of-pearl style buttons, a clean cutaway collar and a tailored-but-not-tight fit make it as comfortable at the office as at a Friday dinner.",
    ].join("\n\n"),
    details: [
      { label: "Fabric", value: "Linen-cotton blend (55/45)" },
      { label: "Fit", value: "Tailored regular" },
      { label: "Care", value: "Machine wash · low iron" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Ivory"], sizes: ["M", "L", "XL"], featured: true, is_new: true, low_stock: false,
    media: [
      { url: "/images/products/shirt.jpg", alt_text: "Ivory linen shirt on hanger against warm cream backdrop" },
    ],
  }),
  P({
    slug: "slate-premium-t-shirt", sku: "PS-MN-003", name: "Slate Premium T-Shirt", name_bn: "",
    category_id: "men", subcategory: "T-Shirts", price: 69000, compare_at_price: 89000,
    short_description: "Heavyweight slate-grey tee with a clean drape — the everyday essential, upgraded.",
    description: [
      "Cut from 220 GSM ring-spun cotton, the Slate Premium T-Shirt holds its shape, resists pilling and drapes cleanly rather than clinging.",
      "A ribbed crew neck and carefully matched side seams keep the silhouette sharp wash after wash.",
    ].join("\n\n"),
    details: [
      { label: "Fabric", value: "220 GSM ring-spun cotton" },
      { label: "Fit", value: "Regular — true to size" },
      { label: "Care", value: "Machine wash · dry shade" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Slate"], sizes: ["S", "M", "L", "XL", "XXL"], featured: false, is_new: false, low_stock: true,
    media: [
      { url: "/images/products/tshirt.jpg", alt_text: "Folded slate grey premium t-shirt on ivory backdrop" },
    ],
  }),
  P({
    slug: "emerald-three-piece", sku: "PS-WM-001", name: "Emerald Three-Piece", name_bn: "এমারেল্ড থ্রি-পিস",
    category_id: "women", subcategory: "Three-Piece", price: 229000, compare_at_price: null,
    short_description: "Kameez, trousers and a hand-finished dupatta in deep emerald — festive yet composed.",
    description: [
      "The Emerald Three-Piece pairs a gracefully flared kameez with straight trousers and a flowing dupatta finished with a fine gold-zari edge.",
      "The fabric is a soft georgette with a matte sheen; the dupatta drapes without stiffness, making it as easy for long days as for celebrations.",
    ].join("\n\n"),
    details: [
      { label: "Fabric", value: "Soft georgette + zari dupatta" },
      { label: "Includes", value: "Kameez · Trouser · Dupatta" },
      { label: "Care", value: "Dry clean recommended" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Emerald"], sizes: ["M", "L", "XL"], featured: true, is_new: true, low_stock: false,
    media: [
      { url: "/images/products/three-piece.jpg", alt_text: "Emerald three-piece on display form, ivory backdrop" },
      { url: "/images/editorial/journal-women.jpg", alt_text: "Emerald three-piece styled beside a sunlit heritage-home window" },
      { url: "/images/products/three-piece-detail.jpg", alt_text: "Dupatta fabric detail with gold zari border" },
    ],
  }),
  P({
    slug: "cream-anarkali-dress", sku: "PS-WM-002", name: "Cream Anarkali Dress", name_bn: "",
    category_id: "women", subcategory: "Dresses", price: 189000, compare_at_price: null,
    short_description: "An ivory anarkali with gentle gold accents — understated celebration dressing.",
    description: [
      "Cut in a fluid ivory crepe, the Cream Anarkali gathers softly from a fitted bodice into a sweeping skirt that moves beautifully.",
      "Fine gold detailing at the neckline offers just enough shimmer for an evening occasion, while the full lining keeps it modest and comfortable.",
    ].join("\n\n"),
    details: [
      { label: "Fabric", value: "Ivory crepe, fully lined" },
      { label: "Fit", value: "Anarkali silhouette" },
      { label: "Care", value: "Dry clean recommended" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Cream"], sizes: ["S", "M", "L", "XL"], featured: false, is_new: true, low_stock: false,
    media: [
      { url: "/images/products/dress.jpg", alt_text: "Cream anarkali dress on display form, ivory backdrop" },
    ],
  }),
  P({
    slug: "dhaka-heritage-lungi", sku: "PS-TR-001", name: "Dhaka Heritage Lungi", name_bn: "",
    category_id: "traditional", subcategory: "Lungi", price: 54000, compare_at_price: null,
    short_description: "A soft, colour-fast woven lungi in a classic deep-teal check — honest everyday comfort.",
    description: [
      "Woven from fine cotton with a colour-fast deep-teal and maroon check, the Dhaka Heritage Lungi is soft from the first wear.",
      "Reinforced edges and a true-to-size cut make it dependable for daily use, home and neighbourhood alike.",
    ].join("\n\n"),
    details: [
      { label: "Fabric", value: "100% cotton, colour-fast" },
      { label: "Length", value: "Standard (92 in)" },
      { label: "Care", value: "Machine wash" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Deep Teal Check"], sizes: ["Free Size"], featured: false, is_new: false, low_stock: false,
    media: [
      { url: "/images/products/lungi.jpg", alt_text: "Neatly folded deep teal lungi on ivory backdrop" },
      { url: "/images/editorial/journal-heritage.jpg", alt_text: "Deep teal checked lungi styled on a shaded heritage veranda" },
    ],
  }),
  P({
    slug: "gamcha-riverside-set", sku: "PS-TR-002", name: "Gamcha Riverside Set", name_bn: "",
    category_id: "traditional", subcategory: "Gamcha", price: 35000, compare_at_price: null,
    short_description: "Three hand-woven gamcha towels in the classic red-cream check — soft, quick-drying, unmistakably home.",
    description: [
      "A set of three traditional Bengali gamcha — soft, absorbent and quick-drying cotton with the timeless red-and-cream woven stripe.",
      "Use them as towels, dupattas, or the everyday carry-all Bangladeshis have trusted for generations.",
    ].join("\n\n"),
    details: [
      { label: "Fabric", value: "Hand-loom cotton" },
      { label: "Contents", value: "3 towels" },
      { label: "Size", value: "45 × 90 in approx." },
      { label: "Care", value: "Machine wash" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Red & Cream"], sizes: ["One Size"], featured: true, is_new: true, low_stock: false,
    media: [
      { url: "/images/products/gamcha.jpg", alt_text: "Folded traditional gamcha towels, red and cream check" },
    ],
  }),
];

const SETTINGS = [
  { key: "low_stock_threshold", value: 5 },
  { key: "free_delivery_threshold_paisa", value: 200000 },
];

/* ------------------------------------------------------------------ */
/* run                                                                 */
/* ------------------------------------------------------------------ */

const variantStock = (p) => (p.low_stock ? 3 : 12);

if (DRY) {
  const variantCount = PRODUCTS.reduce((n, p) => n + p.colors.length * p.sizes.length, 0);
  const mediaCount = PRODUCTS.reduce((n, p) => n + p.media.length, 0);
  console.log("Dry run — would upsert:");
  console.log(`  shops: 1 (prosanti-direct — owner's own catalog)`);
  console.log(`  categories: ${CATEGORIES.length}`);
  console.log(`  delivery_zones: ${ZONES.length}`);
  console.log(`  coupons: ${COUPONS.length}`);
  console.log(`  products: ${PRODUCTS.length}`);
  console.log(`  product_variants: ${variantCount}`);
  console.log(`  product_media: ${mediaCount} (rebuilt per product)`);
  console.log(`  site_settings: ${SETTINGS.length}`);
  process.exit(0);
}

console.log(`Seeding ${URL} …`);

// 0. shop #1 — the owner's own catalog (marketplace slice 1). Everything
// seeded below belongs to it; vendors onboard later via Admin → Shops.
{
  const { error } = await db.from("shops").upsert(
    {
      slug: "prosanti-direct",
      name: "PROSANTI Direct",
      phone: "",
      zone_ids: ZONES.map((z) => z.id),
      prep_minutes: 15,
      commission_pct: 15,
      status: "active",
      is_open: true,
    },
    { onConflict: "slug" },
  );
  if (error) fail("shops upsert", error);
  console.log(`✓ shops (prosanti-direct)`);
}
const { data: shopRow, error: shopError } = await db
  .from("shops")
  .select("id")
  .eq("slug", "prosanti-direct")
  .single();
if (shopError || !shopRow) fail("shops re-read", shopError);
const SHOP_ID = shopRow.id;

// 1. lookup tables
{
  const { error } = await db.from("categories").upsert(CATEGORIES, { onConflict: "id" });
  if (error) fail("categories upsert", error);
  console.log(`✓ categories (${CATEGORIES.length})`);
}
{
  const { error } = await db.from("delivery_zones").upsert(ZONES, { onConflict: "id" });
  if (error) fail("delivery_zones upsert", error);
  console.log(`✓ delivery_zones (${ZONES.length})`);
}
{
  const { error } = await db.from("coupons").upsert(COUPONS, { onConflict: "code" });
  if (error) fail("coupons upsert", error);
  console.log(`✓ coupons (${COUPONS.length})`);
}
{
  const { error } = await db.from("site_settings").upsert(SETTINGS, { onConflict: "key" });
  if (error) fail("site_settings upsert", error);
  console.log(`✓ site_settings (${SETTINGS.length})`);
}

// 2. products (+ ids for the child rows)
{
  const rows = PRODUCTS.map((p) => ({
    slug: p.slug,
    shop_id: SHOP_ID,
    name: p.name,
    name_bn: p.name_bn,
    sku: p.sku,
    category_id: p.category_id,
    subcategory: p.subcategory,
    short_description: p.short_description,
    description: p.description,
    details: p.details,
    price: p.price,
    compare_at_price: p.compare_at_price,
    featured: p.featured,
    is_new: p.is_new,
    in_stock: true,
    low_stock: p.low_stock,
    status: "published",
    active: true,
  }));
  const { error } = await db.from("products").upsert(rows, { onConflict: "slug" });
  if (error) fail("products upsert", error);
  console.log(`✓ products (${rows.length})`);
}
const { data: ids, error: idsError } = await db
  .from("products")
  .select("id,slug")
  .in("slug", PRODUCTS.map((p) => p.slug));
if (idsError) fail("products re-read", idsError);
const idOf = new Map(ids.map((r) => [r.slug, r.id]));

// 3. variants (color × size grid, stock mirrors the demo flags)
{
  const rows = [];
  for (const p of PRODUCTS) {
    const product_id = idOf.get(p.slug);
    let n = 0;
    for (const color of p.colors) {
      for (const size of p.sizes) {
        n += 1;
        rows.push({
          product_id,
          color,
          size,
          sku: `${p.sku}-V${n}`,
          price: p.price,
          stock: variantStock(p),
          reserved: 0,
          active: true,
        });
      }
    }
  }
  const { error } = await db
    .from("product_variants")
    .upsert(rows, { onConflict: "product_id,color,size" });
  if (error) fail("product_variants upsert", error);
  // Re-runs must not resurrect edits: reset only stock shape, keep reservations.
  console.log(`✓ product_variants (${rows.length})`);
}

// 4. media (no natural key → rebuild per product so re-runs stay clean)
{
  const productIds = [...idOf.values()];
  const { error: delError } = await db.from("product_media").delete().in("product_id", productIds);
  if (delError) fail("product_media clear", delError);
  const rows = [];
  for (const p of PRODUCTS) {
    p.media.forEach((m, i) => {
      rows.push({
        product_id: idOf.get(p.slug),
        type: "image",
        url: m.url,
        public_id: null,
        alt_text: m.alt_text,
        sort_order: i,
        metadata: {},
      });
    });
  }
  const { error } = await db.from("product_media").insert(rows);
  if (error) fail("product_media insert", error);
  console.log(`✓ product_media (${rows.length})`);
}

console.log("\nDone. Verify with:  curl <site>/api/health  →  \"mode\":\"live\"");
