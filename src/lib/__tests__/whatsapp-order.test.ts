import { describe, expect, it } from "vitest";
import {
  bagWaMessage,
  productWaMessage,
  shopChatMessage,
  waE164,
  waLink,
  type WaOrderLine,
} from "../whatsapp-order";
import { PRODUCTS } from "../catalog";

const panjabi = PRODUCTS.find((p) => p.slug === "heritage-green-panjabi")!;
const gamcha = PRODUCTS.find((p) => p.slug === "gamcha-riverside-set")!;

const shop = { name: "PROSANTI Direct", phone: "01712345678" };
const shopNoPhone = { name: "PROSANTI Direct", phone: "" };

describe("waE164 — BD mobile normalisation", () => {
  it("normalises the three common forms to one", () => {
    expect(waE164("01712345678")).toBe("8801712345678");
    expect(waE164("+8801712345678")).toBe("8801712345678");
    expect(waE164("8801712345678")).toBe("8801712345678");
    expect(waE164("01712-345-678")).toBe("8801712345678");
  });

  it("refuses numbers that are not real BD mobiles", () => {
    expect(waE164("01212345678")).toBeNull(); // 012 is not a mobile prefix
    expect(waE164("0171234567")).toBeNull(); // 10 digits
    expect(waE164("123")).toBeNull();
    expect(waE164("")).toBeNull();
    expect(waE164(null)).toBeNull();
    expect(waE164(undefined)).toBeNull();
  });
});

describe("waLink", () => {
  it("builds a wa.me deep link with the message encoded", () => {
    const link = waLink("01712345678", "Hello\nline two");
    expect(link).toBe(
      `https://wa.me/8801712345678?text=${encodeURIComponent("Hello\nline two")}`,
    );
  });

  it("returns null for an invalid phone or an empty message", () => {
    expect(waLink("01212345678", "hi")).toBeNull();
    expect(waLink("01712345678", "   ")).toBeNull();
    expect(waLink(null, "hi")).toBeNull();
  });
});

describe("productWaMessage", () => {
  it("EN: names the shop, product, variant, qty, price and COD", () => {
    const line: WaOrderLine = {
      product: panjabi,
      variantLabel: "Forest Green · L",
      qty: 2,
    };
    const msg = productWaMessage(line, shop, "en");
    expect(msg).toContain("PROSANTI Direct");
    expect(msg).toContain(`${panjabi.name} (Forest Green · L) x 2`);
    expect(msg).toContain(`Price: ৳${((panjabi.price * 2) / 100).toLocaleString("en-IN")}`);
    expect(msg).toContain("cash on delivery");
    expect(msg).toContain("PROSANTI website");
  });

  it("drops the 'Default' variant from the line name", () => {
    const msg = productWaMessage(
      { product: gamcha, variantLabel: "Default", qty: 1 },
      shop,
      "en",
    );
    expect(msg).toContain(`${gamcha.name} x 1`);
    expect(msg).not.toContain("(Default)");
  });

  it("BN: the same facts in Bangla", () => {
    const msg = productWaMessage(
      { product: panjabi, variantLabel: "Forest Green · L", qty: 1 },
      shop,
      "bn",
    );
    expect(msg).toContain("PROSANTI Direct");
    expect(msg).toContain("order করতে চাই");
    expect(msg).toContain(`দাম: ৳${(panjabi.price / 100).toLocaleString("en-IN")}`);
    expect(msg).toContain("COD");
  });
});

describe("bagWaMessage", () => {
  const lines: WaOrderLine[] = [
    { product: panjabi, variantLabel: "Forest Green · L", qty: 1 },
    { product: gamcha, variantLabel: "", qty: 3 },
  ];
  const subtotal = panjabi.price + gamcha.price * 3;

  it("numbers every line and states the subtotal", () => {
    const msg = bagWaMessage(lines, subtotal, shop, "en");
    expect(msg).toContain(`1. ${panjabi.name} (Forest Green · L) x 1`);
    expect(msg).toContain(`2. ${gamcha.name} x 3`);
    expect(msg).toContain(`Subtotal: ৳${(subtotal / 100).toLocaleString("en-IN")}`);
    expect(msg).toContain("cash on delivery");
  });

  it("BN variant carries the same lines", () => {
    const msg = bagWaMessage(lines, subtotal, shop, "bn");
    expect(msg).toContain("Subtotal: ৳");
    expect(msg).toContain(`${gamcha.name} x 3`);
  });
});

describe("shopChatMessage", () => {
  it("EN and BN openers name the shop", () => {
    expect(shopChatMessage(shop, "en")).toContain("PROSANTI Direct");
    expect(shopChatMessage(shop, "bn")).toContain("PROSANTI Direct");
  });
});

describe("no phone — no link", () => {
  it("a shop without a plausible mobile has no wa link at all", () => {
    expect(waLink(shopNoPhone.phone, "hi")).toBeNull();
  });
});
