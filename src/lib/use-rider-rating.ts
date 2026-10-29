"use client";

/** The rider's own rating breakdown (202609250008). Decoration: errors stay silent. */
import { riderFetch } from "./use-rider";
import { useScopedRead } from "./use-scoped-read";
import type { RatingSummary } from "./rider-rating";

const readRating = async (path: string) => {
  const data = await riderFetch<{ ready: boolean; summary: RatingSummary | null }>(path);
  return data.summary;
};
const silentRatingError = () => "Rating unavailable";

export function useRiderRating(enabled: boolean) {
  const resource = useScopedRead("/api/rider/ratings", enabled, readRating, silentRatingError);
  return { summary: resource.data, loading: resource.loading };
}
