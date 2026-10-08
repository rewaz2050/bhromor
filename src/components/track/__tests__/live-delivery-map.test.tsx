import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LiveDeliveryMap } from "../live-delivery-map";
import type { Order } from "@/lib/orders";

const baseOrder: Order = {
  id: "PS-20260909-0042",
  createdAt: 1700000000000,
  customer: {
    name: "Rahim",
    phone: "01711111111",
    area: "Kandirpar",
    address: "Kandirpar, Comilla",
  },
  items: [
    {
      productId: "p1",
      slug: "p1",
      name: "Cotton Panjabi",
      sku: "PAN-COT-WHT-M",
      variant: "M / White",
      qty: 1,
      unitPrice: 150000,
      image: "/images/products/panjabi.webp",
    },
  ],
  zoneId: "zone-a",
  zoneName: "Zone A",
  etaLabel: "45-50 min",
  deliveryCharge: 6000,
  total: 156000,
  subtotal: 150000,
  payment: "cod",
  status: "out-for-delivery",
  timeline: [],
};

const withRider: Order = {
  ...baseOrder,
  rider: {
    id: "r1",
    name: "করিম উদ্দিন",
    phone: "01812345678",
    ratingAvg: 4.8,
    ratingCount: 120,
  },
};

describe("LiveDeliveryMap Component", () => {
  it("renders the map, ETA, customer area, and 4-digit security PIN", () => {
    render(<LiveDeliveryMap order={withRider} />);

    expect(screen.getByTestId("live-delivery-map")).toBeInTheDocument();
    expect(screen.getByText(/Kandirpar/i)).toBeInTheDocument();
    expect(screen.getByText(/নিরাপদ ডেলিভারি কোড/i)).toBeInTheDocument();
    expect(screen.getByText(/অ্যাসাইন্ড রাইডার/i)).toBeInTheDocument();
    // A real rider → name, rating and the call button are shown.
    expect(screen.getByText(/করিম উদ্দিন/i)).toBeInTheDocument();
    expect(screen.getByText(/রেটিং 4.8 ★/)).toBeInTheDocument();
    expect(screen.getByText(/কল দিন/i)).toBeInTheDocument();
    // A COD order says COD in the payment row.
    expect(screen.getByText(/ক্যাশ অন ডেলিভারি \(COD\)/)).toBeInTheDocument();
  });

  it("never invents a rider: no name, no call button, no rating without one", () => {
    render(<LiveDeliveryMap order={baseOrder} />);

    expect(screen.getByText(/অ্যাসাইন্ড রাইডার/i)).toBeInTheDocument();
    expect(screen.getByText(/রাইডার খোঁজা হচ্ছে…/)).toBeInTheDocument();
    expect(screen.queryByText(/কল দিন/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/রেটিং/)).not.toBeInTheDocument();
  });

  it("says what a wallet order actually pays in the payment row", () => {
    render(
      <LiveDeliveryMap order={{ ...baseOrder, payment: "bkash" }} />,
    );
    expect(screen.getByText(/bKash \(ওয়ালেট\)/)).toBeInTheDocument();
    expect(screen.queryByText(/ক্যাশ অন ডেলিভারি/)).not.toBeInTheDocument();
  });

  describe("rider position polling", () => {
    afterEach(() => {
      cleanup();
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    const stubFetch = (ageMs = 20_000) => {
      const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>(async () => ({
        ok: true,
        json: async () => ({ lat: 25.0658, lng: 91.395, updatedAt: new Date(Date.now() - ageMs).toISOString() }),
      }));
      vi.stubGlobal("fetch", fetchMock);
      return fetchMock;
    };

    it("asks for the rider's position once on mount, then every 15 s while the tab is visible", async () => {
      vi.useFakeTimers();
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      const fetchMock = stubFetch();
      render(<LiveDeliveryMap order={withRider} />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toContain(
        "/api/track/rider-location?orderId=PS-20260909-0042&phone=01711111111",
      );
      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      // The real position lands in the ETA card.
      expect(screen.getByText(/Rider live 25\.0658,91\.3950/)).toBeInTheDocument();
      // No delivery pin on this order → no distance claim (UX plan §7).
      expect(screen.queryByTestId("rider-away")).not.toBeInTheDocument();
    });

    it("says how far the rider is when the order has a real pin — Bengali digits, honest minutes", async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      stubFetch();
      // ~1.2 km north-east of the rider fix.
      render(<LiveDeliveryMap order={{ ...withRider, lat: 25.0748, lng: 91.4 }} />);
      await act(async () => {
        await Promise.resolve();
      });
      const away = await screen.findByTestId("rider-away");
      expect(away.textContent).toMatch(/রাইডার প্রায় [০-৯.]+ কিমি দূরে · ~[০-৯]+ মিনিট/);
      expect(away.textContent).not.toMatch(/\d/);
      // Post-purchase pass (2026-10-06): the same number sits next to the
      // rider's name — the overlay alone was too easy to miss on a phone.
      const card = await screen.findByTestId("rider-card-away");
      expect(card.textContent).toMatch(/রাইডার প্রায় [০-৯.]+ কিমি দূরে/);
    });

    it("labels how old the rider's fix is", async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      stubFetch(3 * 60_000);
      render(<LiveDeliveryMap order={withRider} />);
      expect(await screen.findByText(/Rider live .*\(৩ মিনিট আগে\)/)).toBeInTheDocument();
      expect(screen.queryByTestId("rider-stale")).not.toBeInTheDocument();
    });

    it("a fix older than five minutes is not shown as live: no distance claim, and the customer is told", async () => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      stubFetch(8 * 60_000);
      render(<LiveDeliveryMap order={{ ...withRider, lat: 25.0748, lng: 91.4 }} />);
      const note = await screen.findByTestId("rider-stale");
      expect(note.textContent).toContain("৮ মিনিট ধরে আসছে না");
      expect(screen.queryByTestId("rider-away")).not.toBeInTheDocument();
      // And the rider card says the same thing in its own words.
      expect(screen.getByText(/শেষ অবস্থান/)).toBeInTheDocument();
    });

    it("stops polling while the tab is hidden", async () => {
      vi.useFakeTimers();
      let visibility: DocumentVisibilityState = "visible";
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
      const fetchMock = stubFetch();
      render(<LiveDeliveryMap order={withRider} />);
      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      act(() => {
        visibility = "hidden";
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await act(async () => {
        vi.advanceTimersByTime(60_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // Back → an instant catch-up read, then the interval resumes.
      await act(async () => {
        visibility = "visible";
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("never polls before the parcel is on the road", async () => {
      vi.useFakeTimers();
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      const fetchMock = stubFetch();
      render(<LiveDeliveryMap order={{ ...withRider, status: "courier-assigned" }} />);
      await act(async () => {
        vi.advanceTimersByTime(45_000);
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
