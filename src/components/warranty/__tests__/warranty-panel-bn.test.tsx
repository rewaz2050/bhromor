/**
 * Warranty panel for Bangla shoppers: heading, warranty length (Bangla digits),
 * the report button and the claim status come from the Bangla copy.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Order } from "@/lib/orders";
import { LanguageProvider } from "@/components/i18n/language-provider";
import WarrantyPanel from "../warranty-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DAY = 24 * 60 * 60 * 1000;

const WARRANTED_ITEM = {
  productId: "p2",
  slug: "leather-handbag",
  name: "Hand-Stitched Leather Handbag",
  sku: "PS-AC-101",
  variant: "One size",
  qty: 1,
  unitPrice: 240000,
  image: "",
  warrantyDays: 30,
};

const makeOrder = (over: Partial<Order> = {}): Order => ({
  id: "PS-20260910-0001",
  createdAt: Date.now() - 9 * DAY,
  customer: { name: "Test Customer", phone: "01712345678", area: "Test Area" },
  zoneId: "z1",
  zoneName: "Sunamganj Sadar",
  etaLabel: "same day",
  items: [WARRANTED_ITEM],
  subtotal: 240000,
  deliveryCharge: 0,
  total: 240000,
  payment: "cod",
  status: "delivered",
  timeline: [
    { status: "pending", at: Date.now() - 9 * DAY },
    { status: "delivered", at: Date.now() - 2 * DAY },
  ],
  ...over,
});

describe("WarrantyPanel — Bangla", () => {
  it("shows the heading, Bangla-digit warranty length and report button", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ claims: [] }), { status: 200 })),
    );
    render(
      <LanguageProvider initialLang="bn">
        <WarrantyPanel order={makeOrder()} />
      </LanguageProvider>,
    );
    expect(screen.getByText("এই অর্ডারের ওয়ারেন্টি")).toBeInTheDocument();
    expect(screen.getByText(/৩০-দিনের ওয়ারেন্টি/)).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "সমস্যা জানান" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Report a problem")).toBeNull();
  });

  it("shows an approved claim's status in Bangla", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            claims: [
              {
                id: "WC-1",
                productId: "p2",
                productName: "Hand-Stitched Leather Handbag",
                problem: "zip",
                status: "approved",
                createdAt: Date.now(),
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    render(
      <LanguageProvider initialLang="bn">
        <WarrantyPanel order={makeOrder()} />
      </LanguageProvider>,
    );
    await waitFor(() =>
      expect(screen.getByText("দাবি অনুমোদিত")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Claim approved")).toBeNull();
  });
});
