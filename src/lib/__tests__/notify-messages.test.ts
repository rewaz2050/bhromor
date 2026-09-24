/**
 * The shopper-facing copy (2026-09-24) — pure, so the promise the opt-in card
 * shows and the message the server sends are asserted in one place.
 */

import { describe, expect, it } from "vitest";
import {
  CUSTOMER_EVENTS,
  CUSTOMER_JOURNEY,
  customerEventLabel,
  customerEventShort,
  customerProductMessage,
  customerPushMessage,
  customerPushPromise,
  statusToEventKind,
} from "../notify-messages";

describe("customer notifications — copy and milestone map", () => {
  it("gives every real transition its own message (2026-09-24: the whole journey)", () => {
    expect(statusToEventKind("confirmed")).toBe("confirmed");
    expect(statusToEventKind("preparing")).toBe("preparing");
    expect(statusToEventKind("ready-for-pickup")).toBe("ready-for-pickup");
    expect(statusToEventKind("courier-assigned")).toBe("rider-assigned");
    expect(statusToEventKind("out-for-delivery")).toBe("picked-up");
    expect(statusToEventKind("delivered")).toBe("delivered");
    expect(statusToEventKind("cancelled")).toBe("cancelled");

    // `pending` has no message of its own (placement already sends `placed`),
    // and a status the shop skips simply sends nothing.
    for (const silent of ["pending", "returned", ""]) {
      expect(statusToEventKind(silent), silent).toBeNull();
    }
  });

  it("builds a Bangla payload with the order number, the total and a working track link", () => {
    const msg = customerPushMessage({
      kind: "picked-up",
      orderNo: "ps-20260924-0007",
      phone: "01712345678",
      total: 124000,
      lang: "bn",
    });
    expect(msg.title).toContain("রাইডার");
    expect(msg.body).toContain("PS-20260924-0007"); // order no is upper-cased
    expect(msg.body).toContain("৳1,240");
    // The tracker's own proof travels in the link, so one tap lands on THIS
    // order with nothing to type.
    expect(msg.href).toBe("/track?id=PS-20260924-0007&phone=01712345678");
  });

  it("defaults to Bangla for a Sunamganj shopper and switches for English readers", () => {
    const bn = customerPushMessage({ kind: "delivered", orderNo: "PS-1", phone: "01712345678" });
    expect(bn.title).toContain("ডেলিভারি");
    const en = customerPushMessage({
      kind: "delivered",
      orderNo: "PS-1",
      phone: "01712345678",
      total: 50000,
      lang: "en",
    });
    expect(en.title).toBe("Delivered 🎉");
    expect(en.body).toContain("Total ৳");
  });

  it("omits money entirely when there is no total (an old row must not print ৳0)", () => {
    const msg = customerPushMessage({ kind: "confirmed", orderNo: "PS-1", phone: "" });
    expect(msg.body).not.toContain("৳");
    expect(msg.body).not.toContain("মোট");
    expect(msg.href).toBe("/track?id=PS-1&phone=");
  });

  it("lists every step the card promises, in the order they arrive", () => {
    const promise = customerPushPromise("bn");
    expect(promise.map((p) => p.kind)).toEqual([...CUSTOMER_JOURNEY]);
    expect(promise.map((p) => p.kind)).toEqual([
      "placed",
      "confirmed",
      "preparing",
      "ready-for-pickup",
      "rider-assigned",
      "picked-up",
      "delivered",
    ]);
    expect(promise[0].label).toContain("অর্ডার পেয়েছি");
    expect(promise[2].label).toContain("প্যাকিং");
    expect(promise[6].label).toContain("ডেলিভারি");
    // Each promise is a real event the fan-out can send, with copy both ways.
    for (const p of promise) {
      expect(CUSTOMER_EVENTS).toContain(p.kind);
      expect(customerEventShort(p.kind, "en").length).toBeGreaterThan(0);
    }
  });

  it("names every event for the operator-side logs and tests", () => {
    for (const kind of CUSTOMER_EVENTS) {
      expect(customerEventLabel(kind, "bn").length).toBeGreaterThan(0);
      expect(customerEventLabel(kind, "en").length).toBeGreaterThan(0);
    }
  });
});

describe("the scheduled-delivery reminder (2026-09-24)", () => {
  it("carries the shop's own window label, not a vague \u201csoon\u201d", () => {
    const bn = customerPushMessage({
      kind: "delivery-today",
      orderNo: "ps-1",
      phone: "01712345678",
      when: "সন্ধ্যায় (৬–৯ PM) · 24 Sep, 6:00 pm",
    });
    expect(bn.title).toContain("আজ আপনার পার্সেল আসছে");
    expect(bn.body).toContain("PS-1");
    expect(bn.body).toContain("সন্ধ্যায় (৬–৯ PM)");
    expect(bn.href).toBe("/track?id=PS-1&phone=01712345678");

    const en = customerPushMessage({
      kind: "delivery-today",
      orderNo: "PS-1",
      phone: "01712345678",
      lang: "en",
    });
    // No window survived to the payload: say "today", never an empty gap.
    expect(en.body).toContain("today");
    expect(en.body).not.toContain("— .");
  });

  it("is not one of the journey steps the opt-in card promises", () => {
    expect(CUSTOMER_EVENTS).not.toContain("delivery-today");
    expect(CUSTOMER_JOURNEY).not.toContain("delivery-today");
    expect(customerPushPromise("bn")).toHaveLength(CUSTOMER_JOURNEY.length);
  });
});

describe("watch notifications — price drop / back in stock", () => {
  it("names the product and the new price, in the shopper's language", () => {
    const drop = customerProductMessage({
      kind: "price-drop",
      productName: "Black Panjabi",
      pricePaisa: 124000,
      href: "/product/black-panjabi",
    });
    expect(drop.title).toContain("দাম কমেছে");
    expect(drop.body).toContain("Black Panjabi");
    expect(drop.body).toContain("৳1,240");
    expect(drop.href).toBe("/product/black-panjabi");

    const back = customerProductMessage({
      kind: "back-in-stock",
      productName: "Black Panjabi",
      pricePaisa: 124000,
      href: "/product/black-panjabi",
      lang: "en",
    });
    expect(back.title).toBe("Back in stock ✅");
    expect(back.body).toContain("৳1,240");
  });

  it("never prints a broken price and never sends a link it did not get", () => {
    const noPrice = customerProductMessage({ kind: "back-in-stock", productName: "Panjabi" });
    expect(noPrice.body).not.toContain("৳");
    expect(noPrice.body).not.toContain("NaN");
    expect(noPrice.body).toContain("Panjabi");

    // `href` is data, not a promise: only same-origin paths travel.
    for (const evil of ["//evil.example/x", "https://evil.example/x", "", "track"]) {
      expect(customerProductMessage({ kind: "price-drop", productName: "X", href: evil }).href).toBe(
        "/shop",
      );
    }
  });
});
