/**
 * P2 #21 — one "right now" line per order state, the PIN exactly when a
 * rider is on the way, and the rider map only when a rider can come.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import OrderNowBanner, { orderStage, showsRiderMap } from "@/components/track/order-now-banner";
import type { Order } from "@/lib/orders";

afterEach(cleanup);

const base: Order = {
  id: "PS-20260918-0007",
  createdAt: 1_758_180_000_000,
  customer: { name: "Rahim", phone: "01711111111", area: "Boropara", address: "House 12" },
  items: [],
  zoneId: "z1",
  zoneName: "Zone A",
  etaLabel: "45-50 min",
  deliveryCharge: 6000,
  total: 156000,
  subtotal: 150000,
  payment: "cod",
  status: "pending",
  timeline: [],
  deliveryCode: "4821",
};

const withStatus = (status: Order["status"], extra: Partial<Order> = {}): Order => ({
  ...base,
  status,
  ...extra,
});

describe("orderStage", () => {
  it("maps the internal enum to the customer stages", () => {
    expect(orderStage(withStatus("pending"))).toBe("pending");
    expect(orderStage(withStatus("confirmed"))).toBe("confirmed");
    expect(orderStage(withStatus("preparing"))).toBe("confirmed");
    expect(orderStage(withStatus("ready-for-pickup"))).toBe("ready");
    expect(orderStage(withStatus("courier-assigned"))).toBe("assigned");
    expect(orderStage(withStatus("out-for-delivery"))).toBe("out");
    expect(orderStage(withStatus("delivered"))).toBe("delivered");
    expect(orderStage(withStatus("cancelled"))).toBe("cancelled");
  });

  it("a wallet payment still under verification wins over the status", () => {
    expect(
      orderStage(withStatus("pending", { payment: "bkash", paymentStatus: "pending_verification" })),
    ).toBe("verifying");
    expect(orderStage(withStatus("confirmed", { payment: "bkash", paymentStatus: "verified" }))).toBe(
      "confirmed",
    );
    // …but never over cancelled / delivered.
    expect(
      orderStage(withStatus("cancelled", { payment: "bkash", paymentStatus: "pending_verification" })),
    ).toBe("cancelled");
  });
});

describe("showsRiderMap", () => {
  it("only while a rider can actually come", () => {
    expect(showsRiderMap(withStatus("confirmed"))).toBe(true);
    expect(showsRiderMap(withStatus("out-for-delivery"))).toBe(true);
    expect(showsRiderMap(withStatus("delivered"))).toBe(false);
    expect(showsRiderMap(withStatus("cancelled"))).toBe(false);
    expect(showsRiderMap(withStatus("confirmed", { isPickup: true }))).toBe(false);
    expect(showsRiderMap(withStatus("confirmed", { zoneId: "z4" }))).toBe(false);
    expect(showsRiderMap(withStatus("confirmed", { isReturn: true }))).toBe(false);
  });
});

describe("OrderNowBanner", () => {
  it("pending COD: 'checking stock', no PIN yet", () => {
    render(<OrderNowBanner order={withStatus("pending")} />);
    const now = screen.getByTestId("order-now");
    expect(now).toHaveAttribute("data-stage", "pending");
    expect(now.textContent).toMatch(/checking stock/);
    expect(screen.queryByTestId("order-now-pin")).not.toBeInTheDocument();
  });

  it("bKash under verification says so, with the wallet name", () => {
    render(
      <OrderNowBanner
        order={withStatus("pending", { payment: "bkash", paymentStatus: "pending_verification" })}
      />,
    );
    expect(screen.getByTestId("order-now").textContent).toMatch(/match your bKash TRXID/);
  });

  it("courier-assigned names the rider", () => {
    render(
      <OrderNowBanner
        order={withStatus("courier-assigned", {
          rider: { id: "r1", name: "Karim", phone: "01812345678", ratingAvg: 4.8, ratingCount: 10 },
        })}
      />,
    );
    expect(screen.getByTestId("order-now").textContent).toMatch(/Rider Karim is picking it up/);
  });

  it("out for delivery: 'on the way' + the 4-digit PIN right there", () => {
    render(<OrderNowBanner order={withStatus("out-for-delivery")} />);
    expect(screen.getByTestId("order-now").textContent).toMatch(/On the way/);
    expect(screen.getByTestId("order-now-pin").textContent).toContain("4821");
  });

  it("pickup and courier orders get their own lines instead of rider copy", () => {
    render(<OrderNowBanner order={withStatus("ready-for-pickup", { isPickup: true })} />);
    expect(screen.getByTestId("order-now").textContent).toMatch(/Ready for pickup at Traffic Point/);
    cleanup();
    render(<OrderNowBanner order={withStatus("out-for-delivery", { zoneId: "z4" })} />);
    expect(screen.getByTestId("order-now").textContent).toMatch(/Booked with the courier — 1–3 days/);
    expect(screen.queryByTestId("order-now-pin")).not.toBeInTheDocument();
  });

  it("delivered points at returns; cancelled says nothing to pay", () => {
    render(<OrderNowBanner order={withStatus("delivered")} />);
    expect(screen.getByTestId("order-now").textContent).toMatch(/Returns are open for 7 days/);
    cleanup();
    render(<OrderNowBanner order={withStatus("cancelled")} />);
    expect(screen.getByTestId("order-now").textContent).toMatch(/nothing to pay/);
  });
});
