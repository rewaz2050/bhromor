/**
 * A6 — what the printed sheet shows. The order data comes from the hook, so
 * this test mocks the hook and asserts the sheet itself: order number, the
 * pieces with their sizes, the address, and the cash to collect.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Order } from "@/lib/orders";

const order: Order = {
  id: "PS-1001",
  createdAt: Date.parse("2026-09-28T11:00:00+06:00"),
  customer: { name: "Rima Akter", phone: "01712345678", area: "Kandirpar", address: "House 7" },
  zoneId: "z1",
  zoneName: "Zone A",
  etaLabel: "30 min",
  items: [
    { productId: "p1", slug: "panjabi", name: "Cotton panjabi", sku: "PNJ-1", variant: "M", qty: 2, unitPrice: 120_000, image: "" },
  ],
  subtotal: 240_000,
  deliveryCharge: 6_000,
  total: 246_000,
  payment: "cod",
  status: "confirmed",
  timeline: [],
};

vi.mock("@/components/vendor/vendor-shell", () => ({
  useVendor: () => ({ shop: { name: "Arian Fashion" }, role: "owner", email: "a@b.c" }),
}));
vi.mock("@/lib/use-vendor", async () => {
  const actual = await vi.importActual<typeof import("@/lib/use-vendor")>("@/lib/use-vendor");
  return {
    ...actual,
    useVendorOrder: () => ({ order, loading: false, error: null, refresh: vi.fn() }),
  };
});

import PackingSlipView from "@/components/vendor/packing-slip-view";

afterEach(cleanup);

describe("<PackingSlipPage>", () => {
  it("prints the order number, the pieces and the cash the rider collects", () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    render(<PackingSlipView id="PS-1001" />);
    const slip = screen.getByTestId("packing-slip");
    expect(slip.textContent).toContain("PS-1001");
    expect(slip.textContent).toContain("Cotton panjabi — M (PNJ-1)");
    expect(slip.textContent).toContain("Rima Akter");
    expect(slip.textContent).toContain("House 7");
    expect(slip.textContent).toContain("Arian Fashion");
    expect(slip.textContent).toContain("৳2,460"); // collect on delivery
    expect(screen.getByText("2 pieces")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("slip-print"));
    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});
