/**
 * UX plan §2 (R10) — the photo-review interrupt shows ONE real approved
 * review with a buyer photo, linked to the piece; nothing without one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { ReviewInterrupt, WhyBand } from "@/components/home/shelf-interrupts";
import { PRODUCTS } from "@/lib/catalog";
// Reviews are cached per key now (flicker pass), so each test starts cold.
import { refreshPublicReviews } from "@/lib/use-public-reviews";

const product = PRODUCTS.find((p) => p.inStock && p.status !== "draft")!;
const reviews = [
  {
    id: "r-text",
    productId: product.id,
    rating: 5,
    author: "Rahim",
    body: "Nice.",
    date: 3,
    status: "approved",
    verified: true,
  },
  {
    id: "r-photo",
    productId: product.id,
    rating: 4,
    author: "Karim",
    body: "কাপড় নরম, সাইজ ঠিক।",
    date: 2,
    status: "approved",
    verified: true,
    photos: ["https://res.cloudinary.com/demo/image/upload/karim.jpg"],
  },
];

vi.mock("@/lib/use-live-catalog", async () => {
  const { PRODUCTS, CATEGORIES } = await import("@/lib/catalog");
  return {
    useLiveCatalog: () => ({ products: PRODUCTS, categories: CATEGORIES, shops: [], live: true, loading: false, liveCategories: CATEGORIES }),
  };
});

let payload: unknown = { reviews };
beforeEach(() => {
  refreshPublicReviews();
  localStorage.clear();
  document.cookie = "prosanti-lang=; max-age=0; path=/";
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify(payload), { status: 200 }))));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReviewInterrupt", () => {
  it("shows the newest photo review, its stars and a link to the piece's reviews", async () => {
    render(
      <LanguageProvider initialLang="bn">
        <ReviewInterrupt />
      </LanguageProvider>,
    );
    const card = await screen.findByTestId("review-interrupt");
    expect(card.textContent).toContain("কাপড় নরম, সাইজ ঠিক।");
    expect(card.textContent).toContain("Karim");
    expect(card.textContent).toContain("যাচাইকৃত ক্রেতা");
    expect(card.querySelector("a")?.getAttribute("href")).toBe(`/product/${product.slug}#reviews`);
    expect(card.querySelector('[aria-label="4/5"]')).not.toBeNull();
  });

  it("renders nothing when no approved review has a photo", async () => {
    payload = { reviews: [reviews[0]] };
    render(
      <LanguageProvider initialLang="en">
        <ReviewInterrupt />
      </LanguageProvider>,
    );
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId("review-interrupt")).toBeNull();
    payload = { reviews };
  });
});

describe("WhyBand", () => {
  it("is bilingual and every fact is a link", () => {
    render(
      <LanguageProvider initialLang="bn">
        <WhyBand />
      </LanguageProvider>,
    );
    const band = screen.getByTestId("why-band");
    expect(band.textContent).toContain("কেন PROSANTI");
    expect(band.textContent).toContain("ক্যাশ অন ডেলিভারি");
    expect(band.querySelectorAll("a").length).toBe(4);
  });
});
