-- =====================================================================
-- PROSANTI — Full catalog seed (run in Supabase SQL Editor)
-- Safe to re-run: all upserts use ON CONFLICT.
-- =====================================================================

BEGIN;

-- 0. Categories
INSERT INTO categories (id, name, name_bn, tagline, image, subcategories, sort_order) VALUES
  ('men', 'Men', 'পুরুষ', 'Panjabi · Shirts · T-Shirts — refined everyday wear', '/images/products/panjabi.jpg', ARRAY['Panjabi','Shirts','T-Shirts'], 0),
  ('women', 'Women', 'নারী', 'Three-piece · Anarkali — graceful, considered dressing', '/images/products/three-piece.jpg', ARRAY['Three-Piece','Dresses'], 1),
  ('traditional', 'Traditional', 'ঐতিহ্য', 'Lungi · Gamcha — heritage textiles for daily life', '/images/products/gamcha.jpg', ARRAY['Lungi','Gamcha'], 2)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, name_bn = EXCLUDED.name_bn, tagline = EXCLUDED.tagline,
  image = EXCLUDED.image, subcategories = EXCLUDED.subcategories, sort_order = EXCLUDED.sort_order;

-- 1. Delivery zones (already seeded by migration 202609110005, but safe to upsert)
INSERT INTO delivery_zones (id, name, areas, charge, eta_label, sort_order, active) VALUES
  ('z1', 'Zone A — Sunamganj City (A Zone)', ARRAY['Boropara','Shologhar','Ukilpara','Courtpara','Jail Road','Modhyabazar','Kalibari','Arambagh','Mollapara'], 3000, '30–40 min', 0, true),
  ('z2', 'Zone B — Sadar Core (1.5-2.5km)', ARRAY['Notunpara','Hasannagar','Tegharia','Nabinagar','Sahib Bari Ghat','Hospital Road','Kazir Point','Purba Bazar','Paschim Bazar'], 5000, '40–50 min', 1, true),
  ('z3', 'Zone C — Sadar Extended (2.5-4km)', ARRAY['Wayesspur','Balaka Para','Jaliapara','Palpur','Dargahpara','Uttarpara','Dakkhinpara','Shologhar Bypass'], 7000, '50–60 min', 2, true),
  ('z4', 'Zone D — Sadar Bahire / Other district (Courier)', ARRAY['Sunamganj Sadar Other','Dolura','Gouripur','Surma River Side','Mollapara Bahire','Shantiganj Border'], 10000, '60–80 min', 3, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, areas = EXCLUDED.areas, charge = EXCLUDED.charge,
  eta_label = EXCLUDED.eta_label, sort_order = EXCLUDED.sort_order, active = EXCLUDED.active;

-- 2. Shop #1 (already seeded by migration, but safe to upsert)
INSERT INTO shops (slug, name, phone, zone_ids, prep_minutes, commission_pct, status, is_open)
VALUES ('prosanti-direct', 'PROSANTI Direct', '', ARRAY['z1','z2','z3','z4'], 15, 15, 'active', true)
ON CONFLICT (slug) DO UPDATE SET
  zone_ids = EXCLUDED.zone_ids, status = EXCLUDED.status, is_open = EXCLUDED.is_open;

-- 3. Site settings
INSERT INTO site_settings (key, value) VALUES
  ('low_stock_threshold', '5'::jsonb),
  ('free_delivery_threshold_paisa', '100000'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- (Removed 2026-09-14: demo product + coupon seeding.)
-- Products and coupons are the shop's own real data — create them in
-- Admin → Catalog & Products / Coupons. This file now seeds ONLY the store
-- skeleton: categories, delivery zones, the owner's shop row and settings.

COMMIT;
