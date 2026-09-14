/**
 * Seed the Supabase store SKELETON: the owner's shop row, categories,
 * delivery zones and starter site settings — the launch configuration the
 * owner defined (real operational data).
 *
 * (Removed 2026-09-14: demo product + variant + media + coupon seeding and
 * the checkout auto-seed that mirrored it. Products and coupons must be the
 * shop's OWN entries, created in Admin → Catalog & Products / Coupons — the
 * storefront honestly shows nothing until then.)
 *
 * Safe to re-run: everything upserts on its natural key.
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
/* store skeleton — the owner's real launch configuration              */
/* ------------------------------------------------------------------ */

const CATEGORIES = [
  { id: "men", name: "Men", name_bn: "পুরুষ", tagline: "Panjabi · Shirts · T-Shirts — refined everyday wear", image: "/images/products/panjabi.jpg", subcategories: ["Panjabi", "Shirts", "T-Shirts"], sort_order: 0 },
  { id: "women", name: "Women", name_bn: "নারী", tagline: "Three-piece · Anarkali — graceful, considered dressing", image: "/images/products/three-piece.jpg", subcategories: ["Three-Piece", "Dresses"], sort_order: 1 },
  { id: "traditional", name: "Traditional", name_bn: "ঐতিহ্য", tagline: "Lungi · Gamcha — heritage textiles for daily life", image: "/images/products/gamcha.jpg", subcategories: ["Lungi", "Gamcha"], sort_order: 2 },
];

const ZONES = [
  { id: "z1", name: "Zone A — Traffic Point (0-1.5km)", areas: ["Boropara","Shologhar","Ukilpara","Courtpara","Jail Road","Modhyabazar","Kalibari","Arambagh","Mollapara"], charge: 3000, eta_label: "30–40 min", sort_order: 0 },
  { id: "z2", name: "Zone B — Sadar Core (1.5-2.5km)", areas: ["Notunpara","Hasannagar","Tegharia","Nabinagar","Sahib Bari Ghat","Hospital Road","Kazir Point","Purba Bazar","Paschim Bazar"], charge: 5000, eta_label: "40–50 min", sort_order: 1 },
  { id: "z3", name: "Zone C — Sadar Extended (2.5-4km)", areas: ["Wayesspur","Balaka Para","Jaliapara","Palpur","Dargahpara","Uttarpara","Dakkhinpara","Shologhar Bypass"], charge: 7000, eta_label: "50–60 min", sort_order: 2 },
  { id: "z4", name: "Zone D — Sunamganj Sadar Bahire", areas: ["Sunamganj Sadar Other","Dolura","Gouripur","Surma River Side","Mollapara Bahire","Shantiganj Border"], charge: 10000, eta_label: "60–80 min", sort_order: 3 },
];

const SETTINGS = [
  { key: "low_stock_threshold", value: 5 },
  { key: "free_delivery_threshold_paisa", value: 100000 },
];

/* ------------------------------------------------------------------ */
/* run                                                                 */
/* ------------------------------------------------------------------ */

if (DRY) {
  console.log("Dry run — would upsert:");
  console.log(`  shops: 1 (prosanti-direct — the owner's own shop row)`);
  console.log(`  categories: ${CATEGORIES.length}`);
  console.log(`  delivery_zones: ${ZONES.length}`);
  console.log(`  site_settings: ${SETTINGS.length}`);
  console.log("  (products & coupons are never seeded — they are the shop's own entries)");
  process.exit(0);
}

console.log(`Seeding ${SUPABASE_URL} …`);

// shop #1 — the owner's own storefront. Vendors onboard later via Admin → Shops.
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

// lookup tables
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
  const { error } = await db.from("site_settings").upsert(SETTINGS, { onConflict: "key" });
  if (error) fail("site_settings upsert", error);
  console.log(`✓ site_settings (${SETTINGS.length})`);
}

console.log("\nDone. The store skeleton is in — now add REAL products & coupons in the admin.");
console.log("Verify with:  curl <site>/api/health  →  \"mode\":\"live\"");
