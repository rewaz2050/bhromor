/**
 * The shopper-facing copy (2026-09-24) — pure, so the promise the opt-in card
 * shows and the message the server sends are asserted in one place.
 */

import { describe, expect, it } from "vitest";
import {
  CUSTOMER_EVENTS,
  customerEventLabel,
  customerPushMessage,
  customerPushPromise,
  publicStepEvent,
  statusToEventKind,
} from "../notify-messages";

describe("customer notifications — copy and milestone map", () => {
  it("maps only the four public milestones, and nothing else", () => {
    expect(statusToEventKind("confirmed")).toBe("confirmed");
    expect(statusToEventKind("out-for-delivery")).toBe("picked-up");
    expect(statusToEventKind("delivered")).toBe("delivered");
    expect(statusToEventKind("cancelled")).toBe("cancelled");

    for (const silent of [
      "pending",
      "preparing",
      "ready-for-pickup",
      "courier-assigned",
      "returned",
      "",
    ]) {
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

  it("lists exactly the four milestones the card promises, in order", () => {
    const promise = customerPushPromise("bn");
    expect(promise.map((p) => p.kind)).toEqual([
      "placed",
      "confirmed",
      "picked-up",
      "delivered",
    ]);
    expect(promise[0].title).toContain("অর্ডার পেয়েছি");
    expect(promise[3].title).toContain("ডেলিভারি");
    // Each promise is a real event the fan-out can send.
    for (const p of promise) expect(CUSTOMER_EVENTS).toContain(p.kind);
    expect(publicStepEvent("placed")).toBe("placed");
    expect(publicStepEvent("picked-up")).toBe("picked-up");
  });

  it("names every event for the operator-side logs and tests", () => {
    for (const kind of CUSTOMER_EVENTS) {
      expect(customerEventLabel(kind, "bn").length).toBeGreaterThan(0);
      expect(customerEventLabel(kind, "en").length).toBeGreaterThan(0);
    }
  });
});
