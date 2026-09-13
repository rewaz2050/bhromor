import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Order } from "@/lib/orders";
import WarrantyPanel from "../warranty-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DAY = 24 * 60 * 60 * 1000;

interface ClaimSeed {
  id: string;
  productId: string;
  productName: string;
  problem: string;
  status: "submitted" | "under_review" | "approved" | "rejected";
  resolution?: string;
}

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
  items: [
    {
      productId: "p1",
      slug: "heritage-green-panjabi",
      name: "Heritage Green Panjabi",
      sku: "PS-MN-001",
      variant: "M",
      qty: 1,
      unitPrice: 125000,
      image: "",
    },
    WARRANTED_ITEM,
  ],
  subtotal: 365000,
  deliveryCharge: 0,
  total: 365000,
  payment: "cod",
  status: "delivered",
  timeline: [
    { status: "pending", at: Date.now() - 9 * DAY },
    { status: "delivered", at: Date.now() - 2 * DAY },
  ],
  ...over,
});

/** Mock the panel's GET (claims) + POST (create) round-trips. */
const mockFetch = (claims: ClaimSeed[] = []) => {
  const fetchMock = vi.fn(
    async (_input: unknown, init?: { method?: string; body?: string }) => {
      if (init?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ claim: { id: "w1", status: "submitted" } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ claims }) };
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("WarrantyPanel", () => {
  it("says nothing for orders that are not delivered yet", () => {
    mockFetch();
    render(
      <WarrantyPanel
        order={makeOrder({
          status: "out-for-delivery",
          timeline: [{ status: "out-for-delivery", at: Date.now() }],
        })}
      />,
    );
    expect(screen.queryByText(/warranty/i)).not.toBeInTheDocument();
  });

  it("says nothing when the order has no warranted items", () => {
    mockFetch();
    render(
      <WarrantyPanel
        order={makeOrder({
          items: [
            {
              productId: "p1",
              slug: "heritage-green-panjabi",
              name: "Heritage Green Panjabi",
              sku: "PS-MN-001",
              variant: "M",
              qty: 1,
              unitPrice: 125000,
              image: "",
            },
          ],
        })}
      />,
    );
    expect(screen.queryByText(/warranty/i)).not.toBeInTheDocument();
  });

  it("a delivered order with a warranted item shows the window and a report button", async () => {
    mockFetch();
    render(<WarrantyPanel order={makeOrder()} />);
    expect(
      await screen.findByRole("button", { name: "Report a problem" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/30-day warranty/)).toBeInTheDocument();
  });

  it("a submitted claim shows the shop-is-looking status, no new form", async () => {
    mockFetch([
      {
        id: "w1",
        productId: "p2",
        productName: "Hand-Stitched Leather Handbag",
        problem: "Zipper stopped closing.",
        status: "submitted",
      },
    ]);
    render(<WarrantyPanel order={makeOrder()} />);
    expect(await screen.findByText("Sent to the shop")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Report a problem" })).not.toBeInTheDocument();
    expect(screen.getByText(/looking into it/i)).toBeInTheDocument();
  });

  it("an approved claim shows the decision plus the shop note", async () => {
    mockFetch([
      {
        id: "w1",
        productId: "p2",
        productName: "Hand-Stitched Leather Handbag",
        problem: "Zipper stopped closing.",
        status: "approved",
        resolution: "Bring it to the Traffic Point shop within 3 days.",
      },
    ]);
    render(<WarrantyPanel order={makeOrder()} />);
    expect(await screen.findByText("Claim approved")).toBeInTheDocument();
    expect(screen.getByText(/Shop note/)).toBeInTheDocument();
    expect(
      screen.getByText(/Traffic Point shop within 3 days/),
    ).toBeInTheDocument();
  });

  it("a rejected claim shows the reason, not a second chance form", async () => {
    mockFetch([
      {
        id: "w1",
        productId: "p2",
        productName: "Hand-Stitched Leather Handbag",
        problem: "Colour not as shown.",
        status: "rejected",
        resolution: "Photos show normal leather ageing — outside warranty.",
      },
    ]);
    render(<WarrantyPanel order={makeOrder()} />);
    expect(await screen.findByText("Not approved")).toBeInTheDocument();
    expect(
      screen.getByText(/normal leather ageing/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Report a problem" })).not.toBeInTheDocument();
  });

  it("sends the claim to /api/warranty with the order proof + item", async () => {
    const fetchMock = mockFetch();
    render(<WarrantyPanel order={makeOrder()} />);
    const button = await screen.findByRole("button", { name: "Report a problem" });
    fireEvent.click(button);
    const textarea = await screen.findByPlaceholderText(/zipper on the handbag/i);
    fireEvent.change(textarea, {
      target: { value: "The zipper stopped closing after two days." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send claim to the shop" }));
    expect(
      await screen.findByText(/Claim sent — the shop will review it/),
    ).toBeInTheDocument();
    const postCall = fetchMock.mock.calls.find((c) => c[1]?.method === "POST");
    expect(postCall).toBeDefined();
    expect(String(postCall?.[0])).toBe("/api/warranty");
    const body = JSON.parse(String(postCall?.[1]?.body)) as Record<string, string>;
    expect(body).toEqual({
      id: "PS-20260910-0001",
      phone: "01712345678",
      productId: "p2",
      problem: "The zipper stopped closing after two days.",
    });
  });

  it("refuses a too-short problem instead of sending it", async () => {
    const fetchMock = mockFetch();
    render(<WarrantyPanel order={makeOrder()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Report a problem" }));
    const textarea = await screen.findByPlaceholderText(/zipper on the handbag/i);
    fireEvent.change(textarea, { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "Send claim to the shop" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/a sentence is enough/i);
    expect(
      fetchMock.mock.calls.filter((c) => c[1]?.method === "POST"),
    ).toHaveLength(0);
  });

  it("outside the warranty window, says so with the end date — no form", async () => {
    mockFetch();
    render(
      <WarrantyPanel
        order={makeOrder({
          createdAt: Date.now() - 60 * DAY,
          timeline: [
            { status: "pending", at: Date.now() - 60 * DAY },
            { status: "delivered", at: Date.now() - 40 * DAY },
          ],
        })}
      />,
    );
    expect(
      await screen.findByText(/warranty window for this item ended/),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Report a problem" })).not.toBeInTheDocument();
  });
});
