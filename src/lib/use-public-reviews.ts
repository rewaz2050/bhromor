"use client";

import { useCallback, useEffect, useState } from "react";
import { useReviews } from "./use-reviews";
import type { Review } from "./review-store";

/**
 * Public review reads/writes with live cutover.
 * - Live: GET/POST /api/reviews (approved-only reads; submissions pending).
 * - Demo: the browser-local review store, exactly as before.
 */
export function usePublicReviews(opts: { product?: string; featured?: boolean } = {}) {
  const key = `${opts.product ?? ""}|${opts.featured ? "1" : ""}`;
  const demo = useReviews();
  const [live, setLive] = useState<Review[] | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (opts.product) params.set("product", opts.product);
    if (opts.featured) params.set("featured", "1");
    void fetch(`/api/reviews?${params.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        const data = (await res.json().catch(() => null)) as {
          demoMode?: boolean;
          reviews?: Review[];
        } | null;
        if (res.ok && data && !data.demoMode && Array.isArray(data.reviews)) {
          setLive(data.reviews);
          setLiveMode(true);
          setError(null);
        } else if (!res.ok) {
          setError("Reviews are unavailable right now.");
        }
        // demoMode / network failure → demo store fallback below.
      })
      .catch(() => {
        // Offline → demo store fallback; not an error state.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed fetch
  }, [key]);

  const submit = useCallback(
    async (input: {
      productId: string;
      author: string;
      rating: number;
      title?: string;
      body: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, author: input.author || "Anonymous customer" }),
        });
        const data = (await res.json().catch(() => null)) as {
          demoMode?: boolean;
          error?: string;
        } | null;
        if (res.ok && data?.demoMode) {
          demo.submit({
            id: `u${Date.now()}`,
            productId: input.productId,
            rating: input.rating,
            author: input.author.trim() || "Anonymous customer",
            title: input.title?.trim() || undefined,
            body: input.body.trim(),
            date: Date.now(),
            status: "pending",
            verified: false,
          });
          return { ok: true };
        }
        if (res.ok) return { ok: true };
        return { ok: false, error: data?.error || "Could not save the review." };
      } catch {
        // Offline in demo mode still records locally; live posts fail honest.
        if (!liveMode) {
          demo.submit({
            id: `u${Date.now()}`,
            productId: input.productId,
            rating: input.rating,
            author: input.author.trim() || "Anonymous customer",
            title: input.title?.trim() || undefined,
            body: input.body.trim(),
            date: Date.now(),
            status: "pending",
            verified: false,
          });
          return { ok: true };
        }
        return { ok: false, error: "Could not reach the shop — try again." };
      }
    },
    [demo, liveMode],
  );

  return {
    reviews: liveMode && live ? live : demo.reviews,
    submit,
    live: liveMode,
    loading,
    error,
  };
}
