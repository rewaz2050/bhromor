import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Order } from "@/lib/orders";
import ReturnPanel from "../return-panel";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DAY = 24 * 60 * 60 * 1000;

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
  ],
  subtotal: 125000,
  deliveryCharge: 0,
  total: 125000,
  payment: "cod",
  status: "delivered",
  timeline: [
    { status: "pending", at: Date.now() - 9 * DAY },
    { status: "delivered", at: Date.now() - 2 * DAY },
  ],
  ...over,
});

describe("ReturnPanel", () => {
  it("says nothing for orders that are not delivered yet", () => {
    render(
      <ReturnPanel
        order={makeOrder({
          status: "out-for-delivery",
          timeline: [{ status: "out-for-delivery", at: Date.now() }],
        })}
        onTrack={vi.fn()}
      />,
    );
    expect(screen.queryByText(/return/i)).not.toBeInTheDocument();
  });

  it("labels a tracked return pickup and shows its reverse-leg status", () => {
    render(
      <ReturnPanel
        order={makeOrder({
          id: "PS-20260912-0007",
          isReturn: true,
          returnReason: "Wrong / uncomfortable size — a bit tight across the chest.",
          returnStatus: "approved",
          returnParentOrderNo: "PS-20260910-0001",
          timeline: [{ status: "ready-for-pickup", at: Date.now() }],
        })}
        onTrack={vi.fn()}
      />,
    );
    expect(
      screen.getByText("Return / exchange pickup"),
    ).toBeInTheDocument();
    expect(screen.getByText("Approved — pickup on the way")).toBeInTheDocument();
    expect(screen.getByText(/tight across the chest/)).toBeInTheDocument();
  });

  it("a delivered parent with a live return shows the leg status and one-tap tracking", () => {
    const onTrack = vi.fn();
    render(
      <ReturnPanel
        order={makeOrder({
          returnChild: {
            orderNo: "PS-20260912-0007",
            status: "ready-for-pickup",
            returnStatus: "requested",
          },
        })}
        onTrack={onTrack}
      />,
    );
    expect(screen.getByText("Awaiting the shop's approval")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Track pickup/ }));
    expect(onTrack).toHaveBeenCalledWith("PS-20260912-0007", "01712345678");
  });

  it("a delivered parent inside the 7-day window offers the home-pickup form", () => {
    render(
      <ReturnPanel
        order={makeOrder()} // delivered 2 days ago → inside the window
        onTrack={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("radio", { name: "Wrong / uncomfortable size" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request home pickup" })).toBeInTheDocument();
  });

  it("submits the request and shows the pickup order number on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ order: { id: "PS-20260912-0007" } }),
      }),
    );
    render(<ReturnPanel order={makeOrder()} onTrack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/tight across the chest/), {
      target: { value: "A bit tight across the chest." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request home pickup" }));
    expect(
      await screen.findByText(/PS-20260912-0007/),
    ).toBeInTheDocument();
    const fetchMock = vi.mocked(fetch);
    const body = JSON.parse(
      String(fetchMock.mock.calls[0][1]?.body),
    ) as Record<string, string>;
    expect(body).toEqual({
      id: "PS-20260910-0001",
      phone: "01712345678",
      reason: "size",
      details: "A bit tight across the chest.",
    });
  });

  it("refuses a too-short detail instead of sending it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }),
    );
    render(<ReturnPanel order={makeOrder()} onTrack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/tight across the chest/), {
      target: { value: "abc" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request home pickup" }));
    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent(/a sentence is enough/i);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("outside the window, says so with the end date — no form", () => {
    render(
      <ReturnPanel
        order={makeOrder({
          createdAt: Date.now() - 20 * DAY,
          timeline: [
            { status: "pending", at: Date.now() - 20 * DAY },
            { status: "delivered", at: Date.now() - 9 * DAY },
          ],
        })}
        onTrack={vi.fn()}
      />,
    );
    expect(
      screen.getByText(/7-day exchange window/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request home pickup" }),
    ).not.toBeInTheDocument();
  });

  it("server errors surface verbatim, not as fake success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          error: "The 7-day exchange window for this order has ended.",
        }),
      }),
    );
    render(<ReturnPanel order={makeOrder()} onTrack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/tight across the chest/), {
      target: { value: "A bit tight across the chest." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Request home pickup" }));
    expect(
      await screen.findByText(
        "The 7-day exchange window for this order has ended.",
      ),
    ).toBeInTheDocument();
  });
});
