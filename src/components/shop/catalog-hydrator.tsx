"use client";

import { useLayoutEffect } from "react";
import type { Category, DeliveryZone, Product, Shop } from "@/lib/catalog";
import { hydrateLiveCatalog } from "@/lib/live-catalog";

/**
 * Seeds the live catalog registry from rows a server page already rendered
 * (audit 2026-09-17 P2.1), so the bag, purchase panel and search resolve
 * products on first paint instead of after a second /api/products fetch.
 *
 * Renders nothing. Mount it once on a server page that read the catalog
 * (`/shop`, `/product/[slug]`, `/shops/[slug]`); pages without server rows
 * keep the fetch-once path in `LiveCatalogBoot`.
 *
 * Why a LAYOUT effect: the hydration render must see the same (empty)
 * registry the server saw, or every `useLiveCatalog()` consumer rendered
 * after this node would mismatch the server HTML. Layout effects run after
 * that render but BEFORE any passive `useEffect` — including the ones in
 * the header search / bag that call `ensureLiveCatalog()` — so the seed is
 * in place before anyone could start a fetch, and subscribers simply
 * re-render once with live rows.
 */
export default function CatalogHydrator({
  products,
  categories,
  shops,
  zones,
}: {
  products: Product[];
  categories?: Category[];
  shops?: Shop[];
  zones?: DeliveryZone[];
}) {
  useLayoutEffect(() => {
    hydrateLiveCatalog({ products, categories, shops, zones });
  }, [products, categories, shops, zones]);
  return null;
}
