/**
 * The review block must not flash (flicker pass 2026-10-07).
 *
 * Two flashes lived here: the "No written reviews yet" card painted while
 * the read was still in flight, and a product revisited a second later
 * re-fetched and re-flashed everything it had already shown.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import ReviewsSection from "@/components/reviews/reviews-section";
import { PRODUCTS } from "@/lib/catalog";
import { refreshPublicReviews } from "@/lib/use-public-reviews";
import type { Review } from "@/lib/review-store";

const product = PRODUCTS[0];

vi.mock("@/lib/use-public-settings", () => ({
  usePublicSettings: () => ({ settings: {}, loading: false }),
}));

const rows: Review[] = [
  {
    id: "r1",
    productId: product.id,
    rating: 5,
    author: "Rima",
    body: "কাপড় ভালো, সাইজ ঠিক ছিল।",
    date: Date.parse("2026-10-01T10:00:00Z"),
    status: "approved",
    verified: true,
  },
];

let payload: unknown = { reviews: [] };
let resolve: (() => void) | null = null;
const fetchMock = vi.fn(() => {
  if (resolve === null) {
    return Promise.resolve(
      new Response(JSON.stringify(payload), { status: 200 }),
    );
  }
  const open = resolve;
  resolve = null;
  return new Promise<Response>((done) => {
    setTimeout(() => {
      open();
      done(new Response(JSON.stringify(payload), { status: 200 }));
    }, 10);
  });
});

beforeEach(() => {
  refreshPublicReviews();
  payload = { reviews: [] };
  resolve = null;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReviewsSection — no flash", () => {
  it("never paints 'no reviews' while the read is still in flight", async () => {
    resolve = () => {};
    render(<ReviewsSection product={product} />);
    // The read has not answered: the empty card must not be there yet.
    expect(screen.queryByText("No written reviews yet")).toBeNull();
    resolve = null;
    await waitFor(() => expect(screen.queryByText("No written reviews yet") !== null).toBe(true));
  });

  it("reads once per product, so a revisit paints instantly", async () => {
    payload = { reviews: rows };
    const first = render(<ReviewsSection product={product} />);
    await waitFor(() => expect(screen.getByText(/কাপড় ভালো/)).toBeInTheDocument());
    const calls = fetchMock.mock.calls.length;
    first.unmount();

    render(<ReviewsSection product={product} />);
    // Second mount: the rows are already known — no request, no flash.
    expect(screen.getByText(/কাপড় ভালো/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});
