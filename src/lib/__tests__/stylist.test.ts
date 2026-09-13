/**
 * P1 #16 — stylist handoff message: the real person on WhatsApp receives
 * the product, the catalog price at the tap, and the topic asked about.
 * The link exists only for a plausible BD mobile — same rule as P1 #15.
 */
import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";
import { stylistWaMessage } from "@/lib/stylist";
import { waLink } from "@/lib/whatsapp-order";

const shop = { name: "PROSANTI Direct", phone: "01712345678" };
const panjabi = PRODUCTS.find((p) => p.subCategory === "Panjabi")!;

describe("stylistWaMessage", () => {
  it("EN carries shop, product, catalog price, topic and source", () => {
    const msg = stylistWaMessage(panjabi, shop, "en", "size");
    expect(msg).toContain("Hello PROSANTI Direct");
    expect(msg).toContain("Heritage Green Panjabi");
    expect(msg).toContain(formatBdt(panjabi.price));
    expect(msg).toContain("which size fits me");
    expect(msg).toContain("(Sent from the PROSANTI website)");
  });

  it("BN variant carries the same facts in Bengali", () => {
    const msg = stylistWaMessage(panjabi, shop, "bn", "pairing");
    expect(msg).toContain("আসসালামু আলাইকুম PROSANTI Direct");
    expect(msg).toContain("Heritage Green Panjabi");
    expect(msg).toContain("এটার সাথে কী ভালো যায়");
    expect(msg).toContain("(PROSANTI website থেকে পাঠানো)");
  });

  it("each topic phrase is distinct", () => {
    const stock = stylistWaMessage(panjabi, shop, "en", "stock");
    expect(stock).toContain("is it in stock right now");
    const pairing = stylistWaMessage(panjabi, shop, "en", "pairing");
    expect(pairing).toContain("what pairs well with this");
  });

  it("no topic falls back to the generic human phrase", () => {
    const msg = stylistWaMessage(panjabi, shop, "en", null);
    expect(msg).toContain("a few questions about fit and pairing");
    expect(stylistWaMessage(panjabi, shop, "en")).toContain(
      "a few questions about fit and pairing",
    );
  });
});

describe("handoff link (waLink integration)", () => {
  it("a real BD mobile becomes a wa.me deep link carrying the message", () => {
    const href = waLink(
      shop.phone,
      stylistWaMessage(panjabi, shop, "en", "stock"),
    );
    expect(href).toMatch(/^https:\/\/wa\.me\/8801712345678\?text=/);
    expect(href).toContain(encodeURIComponent("is it in stock right now"));
  });

  it("no plausible mobile → null — a chat button to nowhere is worse than none", () => {
    expect(waLink("", stylistWaMessage(panjabi, shop, "en"))).toBeNull();
    expect(waLink(undefined, stylistWaMessage(panjabi, shop, "en"))).toBeNull();
    expect(waLink("not a phone", stylistWaMessage(panjabi, shop, "en"))).toBeNull();
  });
});
