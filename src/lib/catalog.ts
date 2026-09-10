import { bdt } from "./format";

/**
 * PROSANTI mock catalog — design/UI phase (Phase 2 catalog UI).
 * Data shapes follow the generic commerce model in the blueprint (§16, §44):
 * Product → Category → SubCategory · Variants (size/color) · Media.
 * In a later phase these records are replaced by Supabase rows and the
 * UI layer reads from a data-access adapter, not this file.
 */

export interface ProductMedia {
  src: string;
  alt: string;
}

export interface Product {
  id: string;
  slug: string;
  sku: string;
  name: string;
  nameBn?: string;
  category: CategoryId;
  subCategory: string;
  price: number; // paisa
  compareAtPrice?: number; // paisa
  shortDescription: string;
  description: string[];
  details: { label: string; value: string }[];
  colors: string[];
  sizes: string[];
  featured: boolean;
  isNew: boolean;
  inStock: boolean;
  lowStock?: boolean;
  media: ProductMedia[];
  video?: { youtubeId: string; label: string }; // future: YouTube preview UI
  rating: number;
  reviewCount: number;
  badge?: "new" | "sale" | "featured";
  /* Admin-phase fields (§73–74) — optional so existing seeds stay valid.
     Drafts/archived products simply never leave the demo admin catalog
     until the Supabase data layer gates the public reads. */
  status?: "draft" | "published";
  active?: boolean;
  stock?: number;
  seo?: { title?: string; description?: string };
  /** Owning shop (marketplace slice 1). Live rows always carry it; seeds
      implicitly belong to shop #1, so demo rows omit it. */
  shopId?: string;
}

/**
 * A listed shop (marketplace phase 2). Phase 1 has exactly one — shop #1,
 * the owner's own catalog ("PROSANTI Direct" until D9 is decided).
 */
export interface Shop {
  id: string;
  slug: string;
  name: string;
  tagline?: string;
  logoUrl?: string;
  phone: string;
  /** Applicant email — STAFF ONLY. Public endpoints must strip it. */
  contactEmail?: string;
  address?: string;
  zoneIds: string[];
  prepMinutes: number;
  commissionPct: number;
  status: "pending" | "active" | "suspended";
  isOpen: boolean;
  ratingAvg: number;
  ratingCount: number;
}

/**
 * A delivery rider (marketplace phase 3). Riders never appear on the
 * storefront — staff see them in Admin → Riders, riders see themselves
 * in the /rider app.
 */
export interface Rider {
  id: string;
  name: string;
  phone: string;
  /** Login email — STAFF ONLY. Never sent to riders or the storefront. */
  contactEmail?: string;
  vehicle: "bicycle" | "bike" | "scooter";
  zoneIds: string[];
  status: "pending" | "active" | "suspended";
  isOnline: boolean;
  cashInHand: number;
  ratingAvg: number;
  ratingCount: number;
}

/**
 * Category ids are data-driven (§5) — admin adds categories without code
 * changes. The literal union keeps autocomplete for the seeded ones while
 * `(string & {})` admits ids created at runtime.
 */
export type CategoryId =
  | "men"
  | "women"
  | "traditional"
  | (string & {});

export interface Category {
  id: CategoryId;
  name: string;
  nameBn: string;
  tagline: string;
  image: string;
  subCategories: string[];
  active?: boolean;
}

export interface DeliveryZone {
  id: string;
  name: string;
  areas: string[];
  charge: number; // paisa
  etaLabel: string; // e.g. "40–50 min"
  active?: boolean;
}

export const CATEGORIES: Category[] = [
  {
    id: "men",
    name: "Men",
    nameBn: "পুরুষ",
    tagline: "Panjabi · Shirts · T-Shirts — refined everyday wear",
    image: "/images/products/panjabi.jpg",
    subCategories: ["Panjabi", "Shirts", "T-Shirts"],
  },
  {
    id: "women",
    name: "Women",
    nameBn: "নারী",
    tagline: "Three-piece · Anarkali — graceful, considered dressing",
    image: "/images/products/three-piece.jpg",
    subCategories: ["Three-Piece", "Dresses"],
  },
  {
    id: "traditional",
    name: "Traditional",
    nameBn: "ঐতিহ্য",
    tagline: "Lungi · Gamcha — heritage textiles for daily life",
    image: "/images/products/gamcha.jpg",
    subCategories: ["Lungi", "Gamcha"],
  },
];

export const PRODUCTS: Product[] = [
  {
    id: "p1",
    slug: "heritage-green-panjabi",
    sku: "PS-MN-001",
    name: "Heritage Green Panjabi",
    nameBn: "হেরিটেজ সবুজ পাঞ্জাবি",
    category: "men",
    subCategory: "Panjabi",
    price: bdt(1490),
    compareAtPrice: bdt(1850),
    shortDescription:
      "A deep forest-green panjabi in breathable premium cotton, cut for Eid and beyond.",
    description: [
      "The Heritage Green Panjabi is tailored from a mid-weight combed cotton with a soft, breathable hand-feel — comfortable across a full day of family gatherings or quiet evenings.",
      "The collar carries a subtle tonal embroidery, kept restrained so the garment reads premium rather than busy. A concealed placket keeps the front line clean.",
      "Cut in a regular, modest silhouette with side slits for ease of movement and prayer-friendly length.",
    ],
    details: [
      { label: "Fabric", value: "100% premium combed cotton" },
      { label: "Fit", value: "Regular · modesty cut" },
      { label: "Care", value: "Gentle machine wash cold" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Forest Green"],
    sizes: ["M", "L", "XL", "XXL"],
    featured: true,
    isNew: true,
    inStock: true,
    lowStock: false,
    rating: 4.8,
    reviewCount: 42,
    badge: "new",
    media: [
      {
        src: "/images/products/panjabi.jpg",
        alt: "Heritage Green Panjabi on hanger, ivory studio backdrop",
      },
      {
        src: "/images/products/panjabi-detail.jpg",
        alt: "Close-up of tonal embroidery at the panjabi collar",
      },
      {
        src: "/images/editorial/hero-prosanti.jpg",
        alt: "Heritage Green Panjabi styled in a sunlit Bangladeshi interior",
      },
    ],
  },
  {
    id: "p2",
    slug: "ivory-linen-shirt",
    sku: "PS-MN-002",
    name: "Ivory Linen Shirt",
    category: "men",
    subCategory: "Shirts",
    price: bdt(1290),
    shortDescription:
      "A crisp ivory-linen shirt with a relaxed collar — the quiet centre of a smart-casual wardrobe.",
    description: [
      "Woven from a linen-rich blend that softens beautifully with every wash, the Ivory Linen Shirt keeps its structure while breathing easily in warm weather.",
      "Mother-of-pearl style buttons, a clean cutaway collar and a tailored-but-not-tight fit make it as comfortable at the office as at a Friday dinner.",
    ],
    details: [
      { label: "Fabric", value: "Linen-cotton blend (55/45)" },
      { label: "Fit", value: "Tailored regular" },
      { label: "Care", value: "Machine wash · low iron" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Ivory"],
    sizes: ["M", "L", "XL"],
    featured: true,
    isNew: true,
    inStock: true,
    rating: 4.7,
    reviewCount: 28,
    badge: "new",
    media: [
      {
        src: "/images/products/shirt.jpg",
        alt: "Ivory linen shirt on hanger against warm cream backdrop",
      },
    ],
  },
  {
    id: "p3",
    slug: "slate-premium-t-shirt",
    sku: "PS-MN-003",
    name: "Slate Premium T-Shirt",
    category: "men",
    subCategory: "T-Shirts",
    price: bdt(690),
    compareAtPrice: bdt(890),
    shortDescription:
      "Heavyweight slate-grey tee with a clean drape — the everyday essential, upgraded.",
    description: [
      "Cut from 220 GSM ring-spun cotton, the Slate Premium T-Shirt holds its shape, resists pilling and drapes cleanly rather than clinging.",
      "A ribbed crew neck and carefully matched side seams keep the silhouette sharp wash after wash.",
    ],
    details: [
      { label: "Fabric", value: "220 GSM ring-spun cotton" },
      { label: "Fit", value: "Regular — true to size" },
      { label: "Care", value: "Machine wash · dry shade" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Slate"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    featured: false,
    isNew: false,
    inStock: true,
    lowStock: true,
    rating: 4.6,
    reviewCount: 61,
    badge: "sale",
    media: [
      {
        src: "/images/products/tshirt.jpg",
        alt: "Folded slate grey premium t-shirt on ivory backdrop",
      },
    ],
  },
  {
    id: "p4",
    slug: "emerald-three-piece",
    sku: "PS-WM-001",
    name: "Emerald Three-Piece",
    nameBn: "এমারেল্ড থ্রি-পিস",
    category: "women",
    subCategory: "Three-Piece",
    price: bdt(2290),
    shortDescription:
      "Kameez, trousers and a hand-finished dupatta in deep emerald — festive yet composed.",
    description: [
      "The Emerald Three-Piece pairs a gracefully flared kameez with straight trousers and a flowing dupatta finished with a fine gold-zari edge.",
      "The fabric is a soft georgette with a matte sheen; the dupatta drapes without stiffness, making it as easy for long days as for celebrations.",
    ],
    details: [
      { label: "Fabric", value: "Soft georgette + zari dupatta" },
      { label: "Includes", value: "Kameez · Trouser · Dupatta" },
      { label: "Care", value: "Dry clean recommended" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Emerald"],
    sizes: ["M", "L", "XL"],
    featured: true,
    isNew: true,
    inStock: true,
    rating: 4.9,
    reviewCount: 37,
    badge: "new",
    media: [
      {
        src: "/images/products/three-piece.jpg",
        alt: "Emerald three-piece on display form, ivory backdrop",
      },
      {
        src: "/images/editorial/journal-women.jpg",
        alt: "Emerald three-piece styled beside a sunlit heritage-home window",
      },
      {
        src: "/images/products/three-piece-detail.jpg",
        alt: "Dupatta fabric detail with gold zari border",
      },
    ],
  },
  {
    id: "p5",
    slug: "cream-anarkali-dress",
    sku: "PS-WM-002",
    name: "Cream Anarkali Dress",
    category: "women",
    subCategory: "Dresses",
    price: bdt(1890),
    shortDescription:
      "An ivory anarkali with gentle gold accents — understated celebration dressing.",
    description: [
      "Cut in a fluid ivory crepe, the Cream Anarkali gathers softly from a fitted bodice into a sweeping skirt that moves beautifully.",
      "Fine gold detailing at the neckline offers just enough shimmer for an evening occasion, while the full lining keeps it modest and comfortable.",
    ],
    details: [
      { label: "Fabric", value: "Ivory crepe, fully lined" },
      { label: "Fit", value: "Anarkali silhouette" },
      { label: "Care", value: "Dry clean recommended" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Cream"],
    sizes: ["S", "M", "L", "XL"],
    featured: false,
    isNew: true,
    inStock: true,
    rating: 4.7,
    reviewCount: 19,
    badge: "new",
    media: [
      {
        src: "/images/products/dress.jpg",
        alt: "Cream anarkali dress on display form, ivory backdrop",
      },
    ],
  },
  {
    id: "p6",
    slug: "dhaka-heritage-lungi",
    sku: "PS-TR-001",
    name: "Dhaka Heritage Lungi",
    category: "traditional",
    subCategory: "Lungi",
    price: bdt(540),
    shortDescription:
      "A soft, colour-fast woven lungi in a classic deep-teal check — honest everyday comfort.",
    description: [
      "Woven from fine cotton with a colour-fast deep-teal and maroon check, the Dhaka Heritage Lungi is soft from the first wear.",
      "Reinforced edges and a true-to-size cut make it dependable for daily use, home and neighbourhood alike.",
    ],
    details: [
      { label: "Fabric", value: "100% cotton, colour-fast" },
      { label: "Length", value: "Standard (92 in)" },
      { label: "Care", value: "Machine wash" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Deep Teal Check"],
    sizes: ["Free Size"],
    featured: false,
    isNew: false,
    inStock: true,
    rating: 4.5,
    reviewCount: 54,
    media: [
      {
        src: "/images/products/lungi.jpg",
        alt: "Neatly folded deep teal lungi on ivory backdrop",
      },
      {
        src: "/images/editorial/journal-heritage.jpg",
        alt: "Deep teal checked lungi styled on a shaded heritage veranda",
      },
    ],
  },
  {
    id: "p7",
    slug: "gamcha-riverside-set",
    sku: "PS-TR-002",
    name: "Gamcha Riverside Set",
    category: "traditional",
    subCategory: "Gamcha",
    price: bdt(350),
    shortDescription:
      "Three hand-woven gamcha towels in the classic red-cream check — soft, quick-drying, unmistakably home.",
    description: [
      "A set of three traditional Bengali gamcha — soft, absorbent and quick-drying cotton with the timeless red-and-cream woven stripe.",
      "Use them as towels, dupattas, or the everyday carry-all Bangladeshis have trusted for generations.",
    ],
    details: [
      { label: "Fabric", value: "Hand-loom cotton" },
      { label: "Contents", value: "3 towels" },
      { label: "Size", value: '45 × 90 in approx.' },
      { label: "Care", value: "Machine wash" },
      { label: "Made in", value: "Bangladesh" },
    ],
    colors: ["Red & Cream"],
    sizes: ["One Size"],
    featured: true,
    isNew: true,
    inStock: true,
    rating: 4.6,
    reviewCount: 33,
    badge: "new",
    media: [
      {
        src: "/images/products/gamcha.jpg",
        alt: "Folded traditional gamcha towels, red and cream check",
      },
    ],
  },
];

export const FEATURED_PRODUCTS = PRODUCTS.filter((p) => p.featured);
export const NEW_ARRIVALS = PRODUCTS.filter((p) => p.isNew);

export const getProductBySlug = (slug: string) =>
  PRODUCTS.find((p) => p.slug === slug);

export const getCategory = (id: string): Category | undefined =>
  CATEGORIES.find((c) => c.id === id);

export const productsByCategory = (id: CategoryId) =>
  PRODUCTS.filter((p) => p.category === id);

/** Sunamganj Sadar delivery zones — Traffic Point centric (10-20 min cycle).
 *  District: Sunamganj, Upazila: Sunamganj Sadar.
 *  First 1000 orders FREE (promo), then zone-based charge + ৳1000 free-delivery threshold.
 */
export const DELIVERY_ZONES: DeliveryZone[] = [
  {
    id: "z1",
    name: "Zone A — Traffic Point (0-1.5km)",
    areas: [
      "Boropara",
      "Shologhar",
      "Ukilpara",
      "Courtpara",
      "Jail Road",
      "Modhyabazar",
      "Kalibari",
      "Arambagh",
      "Mollapara",
    ],
    charge: bdt(30),
    etaLabel: "30–40 min",
  },
  {
    id: "z2",
    name: "Zone B — Sadar Core (1.5-2.5km)",
    areas: [
      "Notunpara",
      "Hasannagar",
      "Tegharia",
      "Nabinagar",
      "Sahib Bari Ghat",
      "Hospital Road",
      "Kazir Point",
      "Purba Bazar",
      "Paschim Bazar",
    ],
    charge: bdt(50),
    etaLabel: "40–50 min",
  },
  {
    id: "z3",
    name: "Zone C — Sadar Extended (2.5-4km)",
    areas: [
      "Wayesspur",
      "Balaka Para",
      "Jaliapara",
      "Palpur",
      "Dargahpara",
      "Uttarpara",
      "Dakkhinpara",
      "Shologhar Bypass",
    ],
    charge: bdt(70),
    etaLabel: "50–60 min",
  },
  {
    id: "z4",
    name: "Zone D — Sunamganj Sadar Bahire",
    areas: [
      "Sunamganj Sadar Other",
      "Dolura",
      "Gouripur",
      "Surma River Side",
      "Mollapara Bahire",
      "Shantiganj Border",
    ],
    charge: bdt(100),
    etaLabel: "60–80 min",
  },
];

export const FLAT_DELIVERY_NOTE =
  "Sunamganj Sadar launch: District Sunamganj, Upazila Sunamganj Sadar, Hub Traffic Point. Zone A ৳30 (0-1.5km), Zone B ৳50, Zone C ৳70, Zone D (Bahire) ৳100. First 1000 orders FREE, then ৳1000+ free. Zones expand as operations can reliably hold the promise.";

export const ORDER_PREFIX = "PS";
