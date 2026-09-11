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

describe("Smart Card stamp progress (1 stamp per non-cancelled order)", () => {
  const defaultSettings: AdminSettings = {
    ...SETTINGS_DEFAULTS,
    loyaltyEnabled: true,
    loyaltyTargetOrders: 10,
    loyaltyRewardTitle: "এক্সক্লুসিভ গিফট হ্যাম্পার",
    loyaltyRewardDescription: "১০টি স্ট্যাম্প সম্পূর্ণ করার জন্য অভিনন্দন!",
    loyaltyMinOrderAmount: 0,
  };

  it("cancelled orders never earn stamps", () => {
    const orders: Order[] = [
      mockOrder("o1", "cancelled", 100000),
      mockOrder("o2", "cancelled", 150000),
    ];

    const result = calculateLoyaltyProgress(orders, defaultSettings);
    expect(result.totalDelivered).toBe(0);
    expect(result.currentStamps).toBe(0);
    expect(result.isUnlocked).toBe(false);
    expect(result.prizeRevealed).toBe(false);
    expect(result.remainingOrders).toBe(10);
    expect(result.percent).toBe(0);
  });

  it("earns 1 stamp per placed order — any non-cancelled status counts", () => {
    const orders: Order[] = [
      mockOrder("o1", "pending", 100000),
      mockOrder("o2", "preparing", 150000),
      mockOrder("o3", "cancelled", 120000),
      mockOrder("o4", "out-for-delivery", 200000),
    ];

    const result = calculateLoyaltyProgress(orders, defaultSettings);
    expect(result.totalDelivered).toBe(3); // cancelled excluded
    expect(result.currentStamps).toBe(3);
    expect(result.prizeRevealed).toBe(true); // visible after the first order
    expect(result.isUnlocked).toBe(false);
    expect(result.remainingOrders).toBe(7);
    expect(result.percent).toBe(30);
  });

  it("prize stays hidden (prizeRevealed false) before the first order", () => {
    const result = calculateLoyaltyProgress([], defaultSettings);
    expect(result.prizeRevealed).toBe(false);
    expect(result.currentStamps).toBe(0);
  });

  it("unlocks the reward at the 10th order and keeps the prize revealed", () => {
    const orders: Order[] = Array.from({ length: 10 }, (_, i) =>
      mockOrder(`o${i + 1}`, "delivered", 100000),
    );

    const result = calculateLoyaltyProgress(orders, defaultSettings);
    expect(result.totalDelivered).toBe(10);
    expect(result.currentStamps).toBe(10);
    expect(result.isUnlocked).toBe(true);
    expect(result.completedCycles).toBe(1);
    expect(result.prizeRevealed).toBe(true);
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
