/**
 * RiderRatingAsk — the track page asks for a delivery rating only once the
 * order is delivered AND a rider carried it; one star tap posts once, and
 * the thank-you replaces the stars.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RiderRatingAsk from "@/components/track/rider-rating-ask";
import { LanguageProvider } from "@/components/i18n/language-provider";
import type { Order } from "@/lib/orders";

const order = (over: Partial<Order> = {}): Order =>
  ({
    id: "PS-20260921-0004",
    createdAt: 1_758_180_000_000,
    customer: { name: "Rahim", phone: "01711111111", area: "Boropara", address: "House 12" },
    items: [],
    zoneId: "z1",
    zoneName: "Sadar",
    etaLabel: "45-50 min",
    deliveryCharge: 6000,
    total: 156000,
    subtotal: 150000,
    payment: "cod",
    status: "delivered",
    timeline: [{ status: "delivered", at: 1_758_180_000_000 }],
    rider: { name: "তানভীর" },
    ...over,
  }) as unknown as Order;

const renderAsk = (o: Order, phone = "01711111111") =>
  render(
    <LanguageProvider>
      <RiderRatingAsk order={o} phone={phone} />
    </LanguageProvider>,
  );

afterEach(cleanup);

describe("RiderRatingAsk — the customer closes the delivery loop", () => {
  it("renders nothing before delivery", () => {
    const { container } = renderAsk(order({ status: "confirmed" }));
    expect(container.querySelector('[data-testid="rider-rating-ask"]')).toBeNull();
  });

  it("renders nothing when no rider carried the order", () => {
    const { container } = renderAsk(order({ rider: undefined }));
    expect(container.querySelector('[data-testid="rider-rating-ask"]')).toBeNull();
  });

  it("asks with the rider's name and posts the tapped stars", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, already: false }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAsk(order());
    expect(screen.getByText(/How was তানভীর's delivery\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("5 stars"));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Thank you"),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/track/rate",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body,
    ) as { id: string; phone: string; stars: number };
    expect(body).toMatchObject({ id: "PS-20260921-0004", phone: "01711111111", stars: 5 });
  });

  it("shows the server's Bangla error, never a crash", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "ডেলিভারি সম্পন্ন হলে তারপর রেটিং দেওয়া যাবে।" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    renderAsk(order());
    fireEvent.click(screen.getByLabelText("4 stars"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
