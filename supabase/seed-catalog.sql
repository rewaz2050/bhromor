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

-- 4. Coupons
INSERT INTO coupons (code, type, value, min_order, category_id, valid_from, valid_until, usage_limit, used, active) VALUES
  ('WELCOME100', 'fixed', 10000, 100000, NULL, NULL, (NOW() + INTERVAL '90 days'), 500, 0, true),
  ('PROSANTI15', 'percent', 15, 200000, NULL, NULL, (NOW() + INTERVAL '30 days'), 200, 0, true),
  ('EID50', 'fixed', 5000, 0, 'men', NULL, (NOW() + INTERVAL '7 days'), NULL, 0, true)
ON CONFLICT (code) DO UPDATE SET
  type = EXCLUDED.type, value = EXCLUDED.value, min_order = EXCLUDED.min_order,
  valid_until = EXCLUDED.valid_until, active = EXCLUDED.active;

-- 5. Products
-- Get shop_id dynamically
DO $$
DECLARE
  v_shop_id uuid;
BEGIN
  SELECT id INTO v_shop_id FROM shops WHERE slug = 'prosanti-direct';
  
  -- p1: Heritage Green Panjabi
  INSERT INTO products (slug, shop_id, name, name_bn, sku, category_id, subcategory,
    short_description, description, details, price, compare_at_price,
    featured, is_new, in_stock, low_stock, status, active)
  VALUES ('heritage-green-panjabi', v_shop_id, 'Heritage Green Panjabi', 'হেরিটেজ সবুজ পাঞ্জাবি', 'PS-MN-001', 'men', 'Panjabi',
    'A deep forest-green panjabi in breathable premium cotton, cut for Eid and beyond.',
    'The Heritage Green Panjabi is tailored from a mid-weight combed cotton with a soft, breathable hand-feel — comfortable across a full day of family gatherings or quiet evenings.

The collar carries a subtle tonal embroidery, kept restrained so the garment reads premium rather than busy. A concealed placket keeps the front line clean.

Cut in a regular, modest silhouette with side slits for ease of movement and prayer-friendly length.',
    '[{"label":"Fabric","value":"100% premium combed cotton"},{"label":"Fit","value":"Regular · modesty cut"},{"label":"Care","value":"Gentle machine wash cold"},{"label":"Made in","value":"Bangladesh"}]'::jsonb,
    149000, 185000, true, true, true, false, 'published', true)
  ON CONFLICT (slug) DO UPDATE SET
    shop_id = EXCLUDED.shop_id, name = EXCLUDED.name, name_bn = EXCLUDED.name_bn,
    price = EXCLUDED.price, compare_at_price = EXCLUDED.compare_at_price,
    featured = EXCLUDED.featured, is_new = EXCLUDED.is_new, status = EXCLUDED.status;

  -- p2: Ivory Linen Shirt
  INSERT INTO products (slug, shop_id, name, name_bn, sku, category_id, subcategory,
    short_description, description, details, price, compare_at_price,
    featured, is_new, in_stock, low_stock, status, active)
  VALUES ('ivory-linen-shirt', v_shop_id, 'Ivory Linen Shirt', '', 'PS-MN-002', 'men', 'Shirts',
    'A crisp ivory-linen shirt with a relaxed collar — the quiet centre of a smart-casual wardrobe.',
    'Woven from a linen-rich blend that softens beautifully with every wash, the Ivory Linen Shirt keeps its structure while breathing easily in warm weather.

Mother-of-pearl style buttons, a clean cutaway collar and a tailored-but-not-tight fit make it as comfortable at the office as at a Friday dinner.',
    '[{"label":"Fabric","value":"Linen-cotton blend (55/45)"},{"label":"Fit","value":"Tailored regular"},{"label":"Care","value":"Machine wash · low iron"},{"label":"Made in","value":"Bangladesh"}]'::jsonb,
    129000, NULL, true, true, true, false, 'published', true)
  ON CONFLICT (slug) DO UPDATE SET
    shop_id = EXCLUDED.shop_id, name = EXCLUDED.name, price = EXCLUDED.price,
    featured = EXCLUDED.featured, is_new = EXCLUDED.is_new, status = EXCLUDED.status;

  -- p3: Slate Premium T-Shirt
  INSERT INTO products (slug, shop_id, name, name_bn, sku, category_id, subcategory,
    short_description, description, details, price, compare_at_price,
    featured, is_new, in_stock, low_stock, status, active)
  VALUES ('slate-premium-t-shirt', v_shop_id, 'Slate Premium T-Shirt', '', 'PS-MN-003', 'men', 'T-Shirts',
    'Heavyweight slate-grey tee with a clean drape — the everyday essential, upgraded.',
    'Cut from 220 GSM ring-spun cotton, the Slate Premium T-Shirt holds its shape, resists pilling and drapes cleanly rather than clinging.

A ribbed crew neck and carefully matched side seams keep the silhouette sharp wash after wash.',
    '[{"label":"Fabric","value":"220 GSM ring-spun cotton"},{"label":"Fit","value":"Regular — true to size"},{"label":"Care","value":"Machine wash · dry shade"},{"label":"Made in","value":"Bangladesh"}]'::jsonb,
    69000, 89000, false, false, true, true, 'published', true)
  ON CONFLICT (slug) DO UPDATE SET
    shop_id = EXCLUDED.shop_id, name = EXCLUDED.name, price = EXCLUDED.price,
    compare_at_price = EXCLUDED.compare_at_price, status = EXCLUDED.status;

  -- p4: Emerald Three-Piece
  INSERT INTO products (slug, shop_id, name, name_bn, sku, category_id, subcategory,
    short_description, description, details, price, compare_at_price,
    featured, is_new, in_stock, low_stock, status, active)
  VALUES ('emerald-three-piece', v_shop_id, 'Emerald Three-Piece', 'এমারেল্ড থ্রি-পিস', 'PS-WM-001', 'women', 'Three-Piece',
    'Kameez, trousers and a hand-finished dupatta in deep emerald — festive yet composed.',
    'The Emerald Three-Piece pairs a gracefully flared kameez with straight trousers and a flowing dupatta finished with a fine gold-zari edge.

The fabric is a soft georgette with a matte sheen; the dupatta drapes without stiffness, making it as easy for long days as for celebrations.',
    '[{"label":"Fabric","value":"Soft georgette + zari dupatta"},{"label":"Includes","value":"Kameez · Trouser · Dupatta"},{"label":"Care","value":"Dry clean recommended"},{"label":"Made in","value":"Bangladesh"}]'::jsonb,
    229000, NULL, true, true, true, false, 'published', true)
  ON CONFLICT (slug) DO UPDATE SET
    shop_id = EXCLUDED.shop_id, name = EXCLUDED.name, name_bn = EXCLUDED.name_bn,
    price = EXCLUDED.price, featured = EXCLUDED.featured, is_new = EXCLUDED.is_new, status = EXCLUDED.status;

  -- p5: Cream Anarkali Dress
  INSERT INTO products (slug, shop_id, name, name_bn, sku, category_id, subcategory,
    short_description, description, details, price, compare_at_price,
    featured, is_new, in_stock, low_stock, status, active)
  VALUES ('cream-anarkali-dress', v_shop_id, 'Cream Anarkali Dress', '', 'PS-WM-002', 'women', 'Dresses',
    'An ivory anarkali with gentle gold accents — understated celebration dressing.',
    'Cut in a fluid ivory crepe, the Cream Anarkali gathers softly from a fitted bodice into a sweeping skirt that moves beautifully.

Fine gold detailing at the neckline offers just enough shimmer for an evening occasion, while the full lining keeps it modest and comfortable.',
    '[{"label":"Fabric","value":"Ivory crepe, fully lined"},{"label":"Fit","value":"Anarkali silhouette"},{"label":"Care","value":"Dry clean recommended"},{"label":"Made in","value":"Bangladesh"}]'::jsonb,
    189000, NULL, false, true, true, false, 'published', true)
  ON CONFLICT (slug) DO UPDATE SET
    shop_id = EXCLUDED.shop_id, name = EXCLUDED.name, price = EXCLUDED.price,
    is_new = EXCLUDED.is_new, status = EXCLUDED.status;

  -- p6: Dhaka Heritage Lungi
  INSERT INTO products (slug, shop_id, name, name_bn, sku, category_id, subcategory,
    short_description, description, details, price, compare_at_price,
    featured, is_new, in_stock, low_stock, status, active)
  VALUES ('dhaka-heritage-lungi', v_shop_id, 'Dhaka Heritage Lungi', '', 'PS-TR-001', 'traditional', 'Lungi',
    'A soft, colour-fast woven lungi in a classic deep-teal check — honest everyday comfort.',
    'Woven from fine cotton with a colour-fast deep-teal and maroon check, the Dhaka Heritage Lungi is soft from the first wear.

Reinforced edges and a true-to-size cut make it dependable for daily use, home and neighbourhood alike.',
    '[{"label":"Fabric","value":"100% cotton, colour-fast"},{"label":"Length","value":"Standard (92 in)"},{"label":"Care","value":"Machine wash"},{"label":"Made in","value":"Bangladesh"}]'::jsonb,
    54000, NULL, false, false, true, false, 'published', true)
  ON CONFLICT (slug) DO UPDATE SET
    shop_id = EXCLUDED.shop_id, name = EXCLUDED.name, price = EXCLUDED.price, status = EXCLUDED.status;

  -- p7: Gamcha Riverside Set
  INSERT INTO products (slug, shop_id, name, name_bn, sku, category_id, subcategory,
    short_description, description, details, price, compare_at_price,
    featured, is_new, in_stock, low_stock, status, active)
  VALUES ('gamcha-riverside-set', v_shop_id, 'Gamcha Riverside Set', '', 'PS-TR-002', 'traditional', 'Gamcha',
    'Three hand-woven gamcha towels in the classic red-cream check — soft, quick-drying, unmistakably home.',
    'A set of three traditional Bengali gamcha — soft, absorbent and quick-drying cotton with the timeless red-and-cream woven stripe.

Use them as towels, dupattas, or the everyday carry-all Bangladeshis have trusted for generations.',
    '[{"label":"Fabric","value":"Hand-loom cotton"},{"label":"Contents","value":"3 towels"},{"label":"Size","value":"45 × 90 in approx."},{"label":"Care","value":"Machine wash"},{"label":"Made in","value":"Bangladesh"}]'::jsonb,
    35000, NULL, true, true, true, false, 'published', true)
  ON CONFLICT (slug) DO UPDATE SET
    shop_id = EXCLUDED.shop_id, name = EXCLUDED.name, price = EXCLUDED.price,
    featured = EXCLUDED.featured, is_new = EXCLUDED.is_new, status = EXCLUDED.status;
END $$;

-- 6. Product variants (color × size grid)
-- p1: Heritage Green Panjabi — Forest Green × M,L,XL,XXL (stock 12)
INSERT INTO product_variants (product_id, color, size, sku, price, stock, reserved, active)
SELECT p.id, 'Forest Green', v.size, 'PS-MN-001-V' || v.n, 149000, 12, 0, true
FROM products p, (VALUES (1,'M'),(2,'L'),(3,'XL'),(4,'XXL')) AS v(n, size)
WHERE p.slug = 'heritage-green-panjabi'
ON CONFLICT (product_id, color, size) DO UPDATE SET stock = EXCLUDED.stock, active = EXCLUDED.active;

-- p2: Ivory Linen Shirt — Ivory × M,L,XL
INSERT INTO product_variants (product_id, color, size, sku, price, stock, reserved, active)
SELECT p.id, 'Ivory', v.size, 'PS-MN-002-V' || v.n, 129000, 12, 0, true
FROM products p, (VALUES (1,'M'),(2,'L'),(3,'XL')) AS v(n, size)
WHERE p.slug = 'ivory-linen-shirt'
ON CONFLICT (product_id, color, size) DO UPDATE SET stock = EXCLUDED.stock, active = EXCLUDED.active;

-- p3: Slate Premium T-Shirt — Slate × S,M,L,XL,XXL (stock 3 = low stock)
INSERT INTO product_variants (product_id, color, size, sku, price, stock, reserved, active)
SELECT p.id, 'Slate', v.size, 'PS-MN-003-V' || v.n, 69000, 3, 0, true
FROM products p, (VALUES (1,'S'),(2,'M'),(3,'L'),(4,'XL'),(5,'XXL')) AS v(n, size)
WHERE p.slug = 'slate-premium-t-shirt'
ON CONFLICT (product_id, color, size) DO UPDATE SET stock = EXCLUDED.stock, active = EXCLUDED.active;

-- p4: Emerald Three-Piece — Emerald × M,L,XL
INSERT INTO product_variants (product_id, color, size, sku, price, stock, reserved, active)
SELECT p.id, 'Emerald', v.size, 'PS-WM-001-V' || v.n, 229000, 12, 0, true
FROM products p, (VALUES (1,'M'),(2,'L'),(3,'XL')) AS v(n, size)
WHERE p.slug = 'emerald-three-piece'
ON CONFLICT (product_id, color, size) DO UPDATE SET stock = EXCLUDED.stock, active = EXCLUDED.active;

-- p5: Cream Anarkali Dress — Cream × S,M,L,XL
INSERT INTO product_variants (product_id, color, size, sku, price, stock, reserved, active)
SELECT p.id, 'Cream', v.size, 'PS-WM-002-V' || v.n, 189000, 12, 0, true
FROM products p, (VALUES (1,'S'),(2,'M'),(3,'L'),(4,'XL')) AS v(n, size)
WHERE p.slug = 'cream-anarkali-dress'
ON CONFLICT (product_id, color, size) DO UPDATE SET stock = EXCLUDED.stock, active = EXCLUDED.active;

-- p6: Dhaka Heritage Lungi — Deep Teal Check × Free Size
INSERT INTO product_variants (product_id, color, size, sku, price, stock, reserved, active)
SELECT p.id, 'Deep Teal Check', 'Free Size', 'PS-TR-001-V1', 54000, 12, 0, true
FROM products p WHERE p.slug = 'dhaka-heritage-lungi'
ON CONFLICT (product_id, color, size) DO UPDATE SET stock = EXCLUDED.stock, active = EXCLUDED.active;

-- p7: Gamcha Riverside Set — Red & Cream × One Size
INSERT INTO product_variants (product_id, color, size, sku, price, stock, reserved, active)
SELECT p.id, 'Red & Cream', 'One Size', 'PS-TR-002-V1', 35000, 12, 0, true
FROM products p WHERE p.slug = 'gamcha-riverside-set'
ON CONFLICT (product_id, color, size) DO UPDATE SET stock = EXCLUDED.stock, active = EXCLUDED.active;

-- 7. Product media
-- First clear existing media for these products (safe re-run)
DELETE FROM product_media WHERE product_id IN (SELECT id FROM products WHERE slug IN (
  'heritage-green-panjabi','ivory-linen-shirt','slate-premium-t-shirt',
  'emerald-three-piece','cream-anarkali-dress','dhaka-heritage-lungi','gamcha-riverside-set'
));

INSERT INTO product_media (product_id, type, url, alt_text, sort_order, metadata)
SELECT p.id, 'image', m.url, m.alt, m.ord, '{}'::jsonb
FROM products p
CROSS JOIN LATERAL (
  VALUES
    ('/images/products/panjabi.jpg', 'Heritage Green Panjabi on hanger, ivory studio backdrop', 0),
    ('/images/products/panjabi-detail.jpg', 'Close-up of tonal embroidery at the panjabi collar', 1),
    ('/images/editorial/hero-prosanti.jpg', 'Heritage Green Panjabi styled in a sunlit Bangladeshi interior', 2)
) AS m(url, alt, ord)
WHERE p.slug = 'heritage-green-panjabi';

INSERT INTO product_media (product_id, type, url, alt_text, sort_order, metadata)
SELECT p.id, 'image', '/images/products/shirt.jpg', 'Ivory linen shirt on hanger against warm cream backdrop', 0, '{}'::jsonb
FROM products p WHERE p.slug = 'ivory-linen-shirt';

INSERT INTO product_media (product_id, type, url, alt_text, sort_order, metadata)
SELECT p.id, 'image', '/images/products/tshirt.jpg', 'Folded slate grey premium t-shirt on ivory backdrop', 0, '{}'::jsonb
FROM products p WHERE p.slug = 'slate-premium-t-shirt';

INSERT INTO product_media (product_id, type, url, alt_text, sort_order, metadata)
SELECT p.id, 'image', m.url, m.alt, m.ord, '{}'::jsonb
FROM products p
CROSS JOIN LATERAL (
  VALUES
    ('/images/products/three-piece.jpg', 'Emerald three-piece on display form, ivory backdrop', 0),
    ('/images/editorial/journal-women.jpg', 'Emerald three-piece styled beside a sunlit heritage-home window', 1),
    ('/images/products/three-piece-detail.jpg', 'Dupatta fabric detail with gold zari border', 2)
) AS m(url, alt, ord)
WHERE p.slug = 'emerald-three-piece';

INSERT INTO product_media (product_id, type, url, alt_text, sort_order, metadata)
SELECT p.id, 'image', '/images/products/dress.jpg', 'Cream anarkali dress on display form, ivory backdrop', 0, '{}'::jsonb
FROM products p WHERE p.slug = 'cream-anarkali-dress';

INSERT INTO product_media (product_id, type, url, alt_text, sort_order, metadata)
SELECT p.id, 'image', m.url, m.alt, m.ord, '{}'::jsonb
FROM products p
CROSS JOIN LATERAL (
  VALUES
    ('/images/products/lungi.jpg', 'Neatly folded deep teal lungi on ivory backdrop', 0),
    ('/images/editorial/journal-heritage.jpg', 'Deep teal checked lungi styled on a shaded heritage veranda', 1)
) AS m(url, alt, ord)
WHERE p.slug = 'dhaka-heritage-lungi';

INSERT INTO product_media (product_id, type, url, alt_text, sort_order, metadata)
SELECT p.id, 'image', '/images/products/gamcha.jpg', 'Folded traditional gamcha towels, red and cream check', 0, '{}'::jsonb
FROM products p WHERE p.slug = 'gamcha-riverside-set';

COMMIT;

-- Verify
SELECT 'products' as tbl, count(*) FROM products WHERE status = 'published' AND active
UNION ALL
SELECT 'variants', count(*) FROM product_variants WHERE active
UNION ALL
SELECT 'media', count(*) FROM product_media
UNION ALL
SELECT 'categories', count(*) FROM categories WHERE active
UNION ALL
SELECT 'coupons', count(*) FROM coupons WHERE active
UNION ALL
SELECT 'zones', count(*) FROM delivery_zones WHERE active
UNION ALL
SELECT 'shops', count(*) FROM shops;
