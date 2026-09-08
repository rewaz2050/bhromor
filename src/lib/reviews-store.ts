/**
 * External store + seed reviews for the review system.
 * Seeds are deterministic per run (8 per product); user submissions and
 * admin moderation persist under localStorage. Server snapshot = seeds,
 * so SSR and hydration stay stable.
 */

import { PRODUCTS } from "./catalog";
import {
  REVIEWS_STORAGE_KEY,
  removeReview,
  setReviewStatus,
  toggleReviewFeatured,
  upsertReview,
  updateReviewInList,
  type Review,
  type ReviewStatus,
} from "./review-store";

/* Seed pools */
const AUTHORS = [
  "Rahat A.", "Nusrat J.", "Tanjim H.", "Farhana I.",
  "Sabbir R.", "Moumita D.", "Arif C.", "Sumaiya K.",
  "Imran H.", "Tahmina A.", "Mehedi S.", "Lamia C.",
  "Rifat K.", "Sharmin B.", "Nayeem U.", "Priya S.",
];

const BODIES = [
  "Fabric feels genuinely premium — soft, breathable and the stitching is immaculate. Very impressed for the price.",
  "Ordered in the morning, it arrived within the hour and the quality was better than expected. Highly recommended.",
  "Colour is true to the photos and sizing is accurate. Already planning a second order for a gift.",
  "Beautiful finish and careful packaging. You can tell this is quality-checked before dispatch.",
  "Comfortable from the first wear — no stiffness, no loose threads. The fit is exactly as the size guide says.",
  "Picked it up from the delivery rider myself — smooth experience from ordering to tracking. Great service.",
  "Was hesitant about online ordering, but the cash-on-delivery option made it easy. Product matches the description.",
  "The details are lovely — neat seams, proper buttons, nothing cheap about it. My go-to store now.",
];

const TITLES = [
  "Excellent quality",
  "Better than expected",
  "True to photos",
  "Lovely finish",
  "Very comfortable",
  "Smooth delivery",
  "Worth every taka",
  "My new favourite",
];

const RATINGS = [5, 5, 4, 5, 4, 5, 5, 4, 5, 4, 5, 4, 5, 5, 4, 5];

const DAY = 86_400_000;

export const seedReviews = (products: { id: string }[]): Review[] => {
  const now = Date.now();
  const reviews: Review[] = [];
  let n = 0;
  for (const product of products) {
    for (let i = 0; i < 8; i++) {
      n += 1;
      reviews.push({
        id: `r${String(n).padStart(4, "0")}`,
        productId: product.id,
        rating: RATINGS[(n + i) % RATINGS.length],
        author: AUTHORS[(n * 3 + i) % AUTHORS.length],
        title: TITLES[(n + i) % TITLES.length],
        body: BODIES[(n + i * 2) % BODIES.length],
        date: now - ((n * 5 + i * 9) % 60) * DAY - (n % 24) * 3_600_000,
        status: "approved",
        verified: (n + i) % 3 !== 0, // two of three come from the order store
        featured: i === 0 && n % 2 === 1,
      });
    }
  }
  return reviews;
};

/* ------------------------------------------------------------------ */

type Listener = () => void;

let cache: Review[] | null = null;
let loaded = false;
const listeners = new Set<Listener>();

const notify = () => {
  for (const l of listeners) l();
};

const ensureLoaded = (): Review[] => {
  if (cache && loaded) return cache;
  loaded = true;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(REVIEWS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Review[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          cache = parsed;
          return cache;
        }
      }
    } catch {
      // corrupted storage → fresh seeds
    }
  }
  cache = seedReviews(PRODUCTS);
  return cache;
};

const persist = (next: Review[]) => {
  cache = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(REVIEWS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // storage unavailable — demo continues in memory
    }
  }
  notify();
};

export const subscribeReviews = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const getReviews = (): Review[] => ensureLoaded();

/** Server snapshot — seed reviews without any localStorage overlay. */
export const getReviewsServer = (): Review[] => seedReviews(PRODUCTS);

export const submitReview = (review: Review) =>
  persist(upsertReview(ensureLoaded(), review));

export const moderateReview = (
  id: string,
  status: "approved" | "hidden" | "flagged",
) =>
  persist(
    updateReviewInList(ensureLoaded(), id, (r) =>
      setReviewStatus(r, status as ReviewStatus),
    ),
  );

export const featureReview = (id: string) =>
  persist(updateReviewInList(ensureLoaded(), id, toggleReviewFeatured));

export const deleteReview = (id: string) =>
  persist(removeReview(ensureLoaded(), id));

export const resetReviews = () => {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(REVIEWS_STORAGE_KEY);
  }
  persist(seedReviews(PRODUCTS));
};
