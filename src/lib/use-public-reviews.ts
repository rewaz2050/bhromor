"use client";

import { useCallback, useEffect, useState } from "react";
import type { Review } from "./review-store";

/**
 * Public review reads/writes — live only.
 * - Live: GET/POST /api/reviews (approved-only reads; submissions pending).
 */
export function usePublicReviews(opts: { product?: string; featured?: boolean } = {}) {
  const key = `${opts.product ?? ""}|${opts.featured ? "1" : ""}`;
  const [reviews, setReviews] = useState<Review[] | null>(null);
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
          reviews?: Review[];
        } | null;
        if (res.ok && data && Array.isArray(data.reviews)) {
          setReviews(data.reviews);
          setError(null);
        } else if (!res.ok) {
          setReviews([]);
          setError("Reviews are unavailable right now.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReviews([]);
          setError("Reviews are unavailable right now.");
        }
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
      /** At most 3 browser-compressed JPEG data URLs (P1 #10 UGC). */
      photos?: string[];
      /** Purchase proof from the track page (UX plan §4/§7, R10) — the server re-checks it. */
      orderId?: string;
      phone?: string;
    }): Promise<{ ok: boolean; error?: string; stampEligible?: boolean }> => {
      try {
        const res = await fetch("/api/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...input, author: input.author || "Anonymous customer" }),
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          stampEligible?: boolean;
        } | null;
        if (res.ok) return { ok: true, stampEligible: data?.stampEligible === true };
        return { ok: false, error: data?.error || "Could not save the review." };
      } catch {
        return { ok: false, error: "Could not reach the shop — try again." };
      }
    },
    [],
  );

  return {
    reviews: reviews ?? [],
    submit,
    live: true,
    loading,
    error,
  };
}
