import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Order } from "@/lib/orders";
import { trackTokenFor } from "@/lib/track-token";

vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ order: null as Order | null, saves: 0 }));
vi.mock("@/lib/db/orders", () => ({ findLiveOrder: async () => state.order }));
vi.mock("@/lib/env", () => ({ isServiceRoleConfigured: () => true }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseService: () => ({}) }));
vi.mock("@/lib/rate-limit-durable", () => ({ checkDurableRateLimit: async () => ({ allowed: true }) }));
vi.mock("@/lib/customer-push", () => ({
  saveCustomerPushSubscription: async () => { state.saves++; return { ok: true }; },
  customerPushSaveFailureReason: () => null,
}));
import { GET } from "@/app/api/track/route";
import { POST } from "@/app/api/track/push/route";
const id = "PS-20261026-0001", phone = "01712345678";
const read = (token = "") => GET(new Request(`https://test.invalid/api/track?id=${id}&phone=${phone}&t=${token}`));
const subscribe = (token = "") => POST(new Request("https://test.invalid/api/track/push", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ id, phone, t: token, endpoint: "https://fcm.googleapis.com/test", keys: { p256dh: "key", auth: "auth" } }),
}));
beforeEach(() => {
  state.saves = 0;
  state.order = { id, customer: { phone }, deliveryCode: "1234", paymentRef: "private-payment", deliveryProofUrl: "https://test.invalid/private.jpg", trackToken: trackTokenFor(id, phone), status: "out-for-delivery", timeline: [{ status: "confirmed", at: 123, note: "Private operational note" }] } as unknown as Order;
});
describe("handoff PIN cannot be bootstrapped from operational contact data", () => {
  it.each(["", "a".repeat(24)])("manual/invalid-token lookup retains status but returns neither PIN nor bearer token (%s)", async token => {
    const res = await read(token);
    expect(res.status).toBe(200);
    const { order } = await res.json();
    expect(order.status).toBe("out-for-delivery");
    expect(order.deliveryCode).toBeUndefined();
    expect(order.trackToken).toBeUndefined();
    expect(order.paymentRef).toBeUndefined();
    expect(order.deliveryProofUrl).toBeUndefined();
    expect(order.timeline).toEqual([{ status: "confirmed", at: 123 }]);
    expect(state.order?.deliveryCode).toBe("1234");
    expect(state.order?.trackToken).toBeTruthy();
  });
  it("preserves receipt-token customer PIN access", async () => {
    const res = await read(trackTokenFor(id, phone));
    const { order } = await res.json();
    expect(order.deliveryCode).toBe("1234");
    expect(order.paymentRef).toBe("private-payment");
    expect(order.deliveryProofUrl).toBe("https://test.invalid/private.jpg");
    expect(order.timeline[0].note).toBe("Private operational note");
  });
  it("rejects another order's otherwise valid token", async () => {
    expect((await (await read(trackTokenFor("PS-OTHER", phone))).json()).order.deliveryCode).toBeUndefined();
  });
  it.each(["", "a".repeat(24)])("contact knowledge alone cannot enroll a device that receives customer capabilities (%s)", async token => {
    expect((await subscribe(token)).status).toBe(403);
    expect(state.saves).toBe(0);
  });
  it("preserves customer push enrollment with valid receipt proof", async () => {
    expect((await subscribe(trackTokenFor(id, phone))).status).toBe(200);
    expect(state.saves).toBe(1);
  });
});
