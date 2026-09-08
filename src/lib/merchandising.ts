import type { Product } from "./catalog";
import { bdt } from "./format";

/** Editorial rules, not sales rankings. Keep discovery and shop results in step. */
export const MOODS = [
  {
    id: "everyday",
    name: "Everyday",
    description: "Minimal. Comfortable. Effortless.",
    image: "/images/products/shirt.jpg",
    alt: "Ivory linen shirt from the everyday edit",
    subCategories: ["Shirts", "T-Shirts", "Lungi", "Gamcha"],
  },
  {
    id: "festive",
    name: "Festive",
    description: "Tradition, refined.",
    image: "/images/products/panjabi.jpg",
    alt: "Green heritage panjabi with embroidered details",
    subCategories: ["Panjabi", "Three-Piece", "Dresses"],
  },
  {
    id: "classic",
    name: "Classic",
    description: "Timeless essentials. Always you.",
    image: "/images/products/lungi.jpg",
    alt: "Traditional cotton lungi from the classic edit",
    subCategories: ["Shirts", "Panjabi", "Lungi"],
  },
] as const;
export type MoodId = (typeof MOODS)[number]["id"];
export const resolveMood = (value: unknown): MoodId | "" =>
  MOODS.find((m) => m.id === value)?.id ?? "";
export const isDiscoverable = (product: Product): boolean =>
  product.active !== false && product.status !== "draft";
export const matchesMood = (product: Product, mood: MoodId | ""): boolean =>
  !mood ||
  (
    MOODS.find((m) => m.id === mood)?.subCategories as
      readonly string[] | undefined
  )?.includes(product.subCategory) === true;
export const under500 = (products: Product[]): Product[] =>
  products.filter((p) => isDiscoverable(p) && p.inStock && p.price < bdt(500));

const COMPLEMENTS: Record<string, string[]> = {
  Panjabi: ["Pajama", "Pajamas"],
  Shirts: ["Trouser", "Trousers"],
  "T-Shirts": ["Trouser", "Trousers"],
  Lungi: ["Gamcha"],
  Gamcha: ["Lungi"],
  Pajama: ["Panjabi"],
  Pajamas: ["Panjabi"],
  Trouser: ["Shirts", "T-Shirts"],
  Trousers: ["Shirts", "T-Shirts"],
};
/** Never fill a styling recommendation with unrelated stock just to fill a grid. */
export const completeTheLook = (
  product: Product,
  products: Product[],
  limit = 4,
): Product[] => {
  const complements = COMPLEMENTS[product.subCategory] ?? [];
  return products
    .filter(
      (p) =>
        p.id !== product.id &&
        isDiscoverable(p) &&
        p.inStock &&
        complements.includes(p.subCategory),
    )
    .slice(0, limit);
};
