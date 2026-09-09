"use client";

/**
 * Admin catalog data with live cutover (see use-orders.ts for the pattern).
 * Live writes go through /api/admin/products + /api/admin/categories;
 * the demo store stays untouched for demo browsers.
 */

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  getCatalog,
  moveCategoryInStore,
  resetCatalogStore,
  saveCategoryInStore,
  saveProductInStore,
  setCategoryActiveInStore,
  setProductActiveInStore,
  toggleProductFlagInStore,
  subscribeCatalog,
} from "./catalog-store";
import type { Category, Product } from "./catalog";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toProductInput = (p: Product): Record<string, unknown> => ({
  name: p.name,
  nameBn: p.nameBn ?? "",
  slug: p.slug,
  sku: p.sku,
  category: p.category,
  subCategory: p.subCategory,
  shortDescription: p.shortDescription,
  description: p.description,
  details: p.details,
  price: p.price,
  compareAtPrice: p.compareAtPrice ?? null,
  colors: p.colors,
  sizes: p.sizes,
  featured: p.featured,
  isNew: p.isNew,
  inStock: p.inStock,
  lowStock: p.lowStock ?? false,
  media: p.media.map((m) => ({ src: m.src, alt: m.alt })),
  video: p.video ? { youtubeId: p.video.youtubeId, label: p.video.label } : undefined,
  status: p.status ?? "published",
  active: p.active ?? true,
  stock: p.stock,
  seo: p.seo,
});

export function useCatalog() {
  const demo = useSyncExternalStore(subscribeCatalog, getCatalog, getCatalog);
  const { live, checked } = useStaffLive();
  const [liveProducts, setLiveProducts] = useState<Product[] | null>(null);
  const [liveCategories, setLiveCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ products: Product[]; categories: Category[] }>(
        "/api/admin/products",
      );
      setLiveProducts(data.products);
      setLiveCategories(data.categories);
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }, []);

  useEffect(() => {
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mode switch resets live state
      setLiveProducts(null);
      setLiveCategories(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const saveProduct = useCallback(
    async (p: Product): Promise<boolean> => {
      if (!live) {
        saveProductInStore(p);
        return true;
      }
      try {
        // Database ids are uuids; anything else is a new demo-id row.
        if (UUID_RE.test(p.id)) {
          await apiSend(
            `/api/admin/products/${encodeURIComponent(p.id)}`,
            "PATCH",
            toProductInput(p),
          );
        } else {
          await apiSend("/api/admin/products", "POST", toProductInput(p));
        }
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [live, refresh],
  );

  const toggleFlag = useCallback(
    async (id: string, flag: "featured" | "isNew", value: boolean): Promise<void> => {
      if (!live) {
        toggleProductFlagInStore(id, flag, value);
        return;
      }
      try {
        await apiSend(`/api/admin/products/${encodeURIComponent(id)}`, "PATCH", {
          [flag]: value,
        });
        setError(null);
        await refresh();
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    },
    [live, refresh],
  );

  const setProductActive = useCallback(
    async (id: string, active: boolean): Promise<void> => {
      if (!live) {
        setProductActiveInStore(id, active);
        return;
      }
      try {
        await apiSend(`/api/admin/products/${encodeURIComponent(id)}`, "PATCH", {
          active,
        });
        setError(null);
        await refresh();
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    },
    [live, refresh],
  );

  const saveCategory = useCallback(
    async (c: Category): Promise<boolean> => {
      if (!live) {
        saveCategoryInStore(c);
        return true;
      }
      try {
        await apiSend("/api/admin/categories", "POST", c);
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [live, refresh],
  );

  const setCategoryActive = useCallback(
    async (id: string, active: boolean): Promise<void> => {
      if (!live) {
        setCategoryActiveInStore(id, active);
        return;
      }
      const current = liveCategories?.find((c) => c.id === id);
      if (!current) return;
      try {
        await apiSend("/api/admin/categories", "POST", { ...current, active });
        setError(null);
        await refresh();
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    },
    [live, liveCategories, refresh],
  );

  const moveCategory = useCallback(
    async (id: string, dir: -1 | 1): Promise<void> => {
      if (!live) {
        moveCategoryInStore(id, dir);
        return;
      }
      try {
        const data = await apiSend<{ categories: Category[] }>(
          "/api/admin/categories",
          "POST",
          { action: "move", id, dir },
        );
        setLiveCategories(data.categories);
        setError(null);
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    },
    [live],
  );

  const reset = useCallback(() => {
    if (live) void refresh();
    else resetCatalogStore();
  }, [live, refresh]);

  return {
    products: live ? (liveProducts ?? []) : demo.products,
    categories: live ? (liveCategories ?? []) : demo.categories,
    saveProduct,
    toggleFlag,
    setProductActive,
    saveCategory,
    setCategoryActive,
    moveCategory,
    reset,
    live,
    loading: live && (!checked || liveProducts === null),
    error,
    clearError: () => setError(null),
  };
}
