import { describe, expect, it } from "vitest";
import { calculateLoyaltyProgress } from "../loyalty";
import { SETTINGS_DEFAULTS, type AdminSettings } from "../settings-store";
import type { Order } from "../orders";

const mockOrder = (id: string, status: Order["status"], total: number, phone?: string): Order => ({
  id,
  createdAt: 1700000000000,
  customer: {
    name: "Rahim",
    phone: phone ?? "01711111111",
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
      unitPrice: total,
      image: "/images/products/panjabi.webp",
    },
  ],
  zoneId: "zone-a",
  zoneName: "Zone A",
  etaLabel: "45-50 min",
  deliveryCharge: 6000,
  total,
  subtotal: total - 6000,
  payment: "cod",
  status,
  timeline: [],
});

describe("Loyalty Stamp Progress Calculator", () => {
  const defaultSettings: AdminSettings = {
    ...SETTINGS_DEFAULTS,
    loyaltyEnabled: true,
    loyaltyTargetOrders: 10,
    loyaltyRewardTitle: "এক্সক্লুসিভ গিফট হ্যাম্পার",
    loyaltyRewardDescription: "১০টি সফল ডেলিভারি সম্পন্ন করার জন্য অভিনন্দন!",
    loyaltyMinOrderAmount: 0,
  };

  it("calculates 0 progress when there are no delivered orders", () => {
    const orders: Order[] = [
      mockOrder("o1", "pending", 100000),
      mockOrder("o2", "preparing", 150000),
      mockOrder("o3", "cancelled", 120000),
    ];

    const result = calculateLoyaltyProgress(orders, defaultSettings);
    expect(result.totalDelivered).toBe(0);
    expect(result.currentStamps).toBe(0);
    expect(result.isUnlocked).toBe(false);
    expect(result.remainingOrders).toBe(10);
    expect(result.percent).toBe(0);
  });

  it("counts only delivered orders towards stamps", () => {
    const orders: Order[] = [
      mockOrder("o1", "delivered", 100000),
      mockOrder("o2", "delivered", 150000),
      mockOrder("o3", "cancelled", 120000),
      mockOrder("o4", "out-for-delivery", 200000),
    ];

    const result = calculateLoyaltyProgress(orders, defaultSettings);
    expect(result.totalDelivered).toBe(2);
    expect(result.currentStamps).toBe(2);
    expect(result.isUnlocked).toBe(false);
    expect(result.remainingOrders).toBe(8);
    expect(result.percent).toBe(20);
  });

  it("unlocks reward when reaching 10 delivered orders", () => {
    const orders: Order[] = Array.from({ length: 10 }, (_, i) =>
      mockOrder(`o${i + 1}`, "delivered", 100000),
    );

    const result = calculateLoyaltyProgress(orders, defaultSettings);
    expect(result.totalDelivered).toBe(10);
    expect(result.currentStamps).toBe(10);
    expect(result.isUnlocked).toBe(true);
    expect(result.completedCycles).toBe(1);
    expect(result.remainingOrders).toBe(0);
    expect(result.percent).toBe(100);
    expect(result.rewardTitle).toBe("এক্সক্লুসিভ গিফট হ্যাম্পার");
  });

  it("filters by customer phone when specified", () => {
    const orders: Order[] = [
      mockOrder("o1", "delivered", 100000, "01711111111"),
      mockOrder("o2", "delivered", 120000, "01711111111"),
      mockOrder("o3", "delivered", 150000, "01999999999"),
    ];

    const result = calculateLoyaltyProgress(orders, defaultSettings, {
      phone: "01711111111",
    });
    expect(result.totalDelivered).toBe(2);
    expect(result.currentStamps).toBe(2);
  });

  it("respects minimum order amount filter when configured", () => {
    const settingsWithMin: AdminSettings = {
      ...defaultSettings,
      loyaltyMinOrderAmount: 1000, // min ৳1000 (= 100000 paisa)
    };

    const orders: Order[] = [
      mockOrder("o1", "delivered", 50000), // ৳500 -> too low
      mockOrder("o2", "delivered", 120000), // ৳1200 -> counts
      mockOrder("o3", "delivered", 150000), // ৳1500 -> counts
    ];

    const result = calculateLoyaltyProgress(orders, settingsWithMin);
    expect(result.totalDelivered).toBe(2);
    expect(result.currentStamps).toBe(2);
  });
});
