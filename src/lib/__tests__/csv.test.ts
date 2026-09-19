import { describe, expect, it } from "vitest";
import {
  ORDER_CSV_HEADER,
  csvField,
  csvLine,
  localStamp,
  orderCsvRow,
  ordersCsv,
  takaCell,
} from "../csv";
import type { Order } from "../orders";

const order = (over: Partial<Order> = {}): Order => ({
  id: "PS-20260918-0007",
  createdAt: new Date(2026, 8, 18, 14, 5).getTime(),
  customer: {
    name: 'Rahim "Bhai" Uddin',
    phone: "01711111111",
    area: "Hasan Nagar",
    address: "House 12, Road 3",
  },
  zoneId: "z1",
  zoneName: "Town",
  etaLabel: "45–60 min",
  items: [
    { productId: "p1", slug: "saree", name: "Jamdani Saree", sku: "JS-1", variant: "Red / Free", qty: 2, unitPrice: 120000, image: "" },
    { productId: "p2", slug: "gamcha", name: "Gamcha, classic", sku: "G-1", variant: "", qty: 1, unitPrice: 15000, image: "" },
  ],
  subtotal: 255000,
  deliveryCharge: 5000,
  total: 250000,
  coupon: { code: "EID10", discount: 10000 },
  payment: "bkash",
  paymentStatus: "verified",
  status: "delivered",
  timeline: [],
  rider: { id: "r1", name: "Rafiq", phone: "017", ratingAvg: 5, ratingCount: 1 },
  ...over,
});

describe("csvField", () => {
  it("quotes commas, quotes and newlines; doubles embedded quotes", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField(null)).toBe("");
    expect(csvField(undefined)).toBe("");
  });

  it("neutralises spreadsheet formula injection", () => {
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField("+880")).toBe("'+880");
    expect(csvField("-5")).toBe("'-5");
    expect(csvField("@cmd")).toBe("'@cmd");
  });
});

describe("orderCsvRow / ordersCsv", () => {
  it("writes taka (not paisa), local time, items, payment and rider", () => {
    const row = orderCsvRow(order());
    expect(row).toContain("PS-20260918-0007,2026-09-18 14:05,delivered,");
    expect(row).toContain('"Rahim ""Bhai"" Uddin"');
    expect(row).toContain("2× Jamdani Saree (Red / Free); 1× Gamcha, classic");
    // money columns: subtotal, delivery, discount, total
    expect(row).toContain(",2550.00,50.00,100.00,2500.00,");
    expect(row).toContain("Paid by bKash — verified,verified,EID10,Rafiq,delivery");
  });

  it("marks pickup and return legs and leaves COD payment status blank", () => {
    expect(orderCsvRow(order({ payment: "cod", paymentStatus: undefined, isPickup: true }))).toMatch(
      /Cash on delivery,,EID10,Rafiq,pickup$/,
    );
    expect(orderCsvRow(order({ isReturn: true }))).toMatch(/,return$/);
  });

  it("starts with a BOM, the header, and uses CRLF rows", () => {
    const csv = ordersCsv([order(), order({ id: "PS-20260918-0008" })]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toBe(csvLine(ORDER_CSV_HEADER));
    expect(lines).toHaveLength(4); // header + 2 rows + trailing empty
    expect(lines[2].startsWith("PS-20260918-0008,")).toBe(true);
  });

  it("helpers", () => {
    expect(takaCell(120050)).toBe("1200.50");
    expect(localStamp(new Date(2026, 0, 5, 9, 7).getTime())).toBe("2026-01-05 09:07");
  });
});
