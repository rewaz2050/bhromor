"use client";

import { useEffect, useState } from "react";
import { FIRST_FREE_DELIVERY_LIMIT } from "./delivery";

export interface PromoStatus {
  totalOrders: number;
  remainingFree: number;
  promoActive: boolean;
  limit: number;
  loading: boolean;
}

export function usePromo(): PromoStatus {
  const [status, setStatus] = useState<PromoStatus>({
    totalOrders: 0,
    remainingFree: FIRST_FREE_DELIVERY_LIMIT,
    promoActive: true,
    limit: FIRST_FREE_DELIVERY_LIMIT,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;
    const fetchPromo = async () => {
      try {
        const res = await fetch("/api/promo", { cache: "no-store" });
        if (!res.ok) throw new Error("promo fetch failed");
        const data = await res.json();
        if (cancelled) return;
        setStatus({
          totalOrders: data.totalOrders ?? 0,
          remainingFree: data.remainingFree ?? FIRST_FREE_DELIVERY_LIMIT,
          promoActive: data.promoActive ?? true,
          limit: data.limit ?? FIRST_FREE_DELIVERY_LIMIT,
          loading: false,
        });
      } catch {
        if (cancelled) return;
        setStatus((s) => ({ ...s, loading: false }));
      }
    };
    void fetchPromo();
    const id = setInterval(fetchPromo, 60_000); // refresh every minute
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return status;
}
