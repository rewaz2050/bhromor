"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Review } from "./review-store";
import type { FitKey } from "./review-fit";

/**
 * Public review reads/writes — live only.
 *
 * Reads go through ONE module store (flicker pass 2026-10-07). The old hook
 * kept the rows in component state, so every mount began with
 * `loading: true` and an empty list — a product page flashed its review
 * skeleton on every visit, including a back-navigation to a page whose
 * reviews the browser had fetched a second earlier. Now the rows are cached
 * per (product, featured) key: a warm read paints on the first frame, and
 * only a key that has never been asked shows a skeleton.
 *
 * - Live: GET/POST /api/reviews (approved-only reads; submissions pending).
 */

type Listener = () => void;

interface ReviewState {
  status: "loading" | "ready" | "error";
  reviews: Review[];
}

/** One identity for "not asked yet" — a store snapshot must be referentially stable. */
const UNASKED: ReviewState = { status: "loading", reviews: [] };
const cache = new Map<string, ReviewState>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<Listener>();

const notify = () => {
  for (const fn of listeners) fn();
};

const subscribe = (fn: Listener): (() => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** Stable per key — a fresh identity would resubscribe on every render. */
const snapshots = new Map<string, () => ReviewState>();
const snapshotFor = (key: string): (() => ReviewState) => {
  let fn = snapshots.get(key);
  if (!fn) {
    fn = () => cache.get(key) ?? UNASKED;
    snapshots.set(key, fn);
  }
  return fn;
};

/** The server never has rows to render: the same empty answer every time. */
const serverSnapshot = (): ReviewState => UNASKED;

const ensureReviews = (
  key: string,
  product?: string,
  featured?: boolean,
): Promise<void> => {
  if (cache.has(key)) return Promise.resolve();
  const running = inflight.get(key);
  if (running) return running;

  const params = new URLSearchParams();
  if (product) params.set("product", product);
  if (featured) params.set("featured", "1");

  const request = fetch(`/api/reviews?${params.toString()}`, { cache: "no-store" })
    .then(async (res) => {
      if (!res.ok) throw new Error(`reviews ${res.status}`);
      const data = (await res.json().catch(() => null)) as {
        reviews?: Review[];
      } | null;
      if (!data || !Array.isArray(data.reviews)) throw new Error("reviews shape");
      cache.set(key, { status: "ready", reviews: data.reviews });
    })
    .catch(() => {
      // A failed read is remembered as failed, not as "still loading" — the
      // block says it cannot reach the shop instead of pulsing forever.
      cache.set(key, { status: "error", reviews: [] });
    })
    .finally(() => {
      inflight.delete(key);
      notify();
    });

  inflight.set(key, request);
  return request;
};

/** Forget what we know — a review of this product was just written. */
export const refreshPublicReviews = (productId?: string): void => {
  let dropped = false;
  for (const key of [...cache.keys()]) {
    if (productId === undefined || key.startsWith(`${productId}|`)) {
      cache.delete(key);
      dropped = true;
    }
  }
  if (dropped) notify();
};

export function usePublicReviews(opts: { product?: string; featured?: boolean } = {}) {
  const key = `${opts.product ?? ""}|${opts.featured ? "1" : ""}`;
  const state = useSyncExternalStore(subscribe, snapshotFor(key), serverSnapshot);

  useEffect(() => {
    void ensureReviews(key, opts.product, opts.featured);
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
      /** One-tap fit answer (fit-data pass 2026-10-06) — optional, ignored when blank. */
      fit?: FitKey;
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
    // null = not asked yet, NOT "no reviews" — the difference between a
    // product nobody reviewed and a page that has not finished loading. A
    // block that renders [] before the read answers flashes its empty state
    // at every shopper (flicker pass 2026-10-07).
    reviews: state.status === "loading" ? null : state.reviews,
    submit,
    live: true,
    loading: state.status === "loading",
    error: state.status === "error" ? "Reviews are unavailable right now." : null,
  };
}
