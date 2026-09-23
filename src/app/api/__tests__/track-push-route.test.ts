/**
 * /api/track/push — the public endpoint that binds a shopper's device to the
 * phone number on their order (2026-09-24).
 *
 * The security question this test answers: anybody can POST here, so what
 * stops a stranger from subscribing their own phone to someone else's
 * parcels? The tracker's own proof — order number AND that order's phone
 * must match before a single row is written. Everything else is honesty:
 * `ready:false` when migration 202609240001 is missing, `configured:false`
 * when the host has no VAPID keys, 404 (not "wrong phone") on a mismatch.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  order: null as null | { id: string; customer: { phone: string } },
  saved: [] as Record<string, unknown>[],
  deleted: [] as string[],
  tableMissing: false,
  keys: true,
  nextErr: null as null | { code?: string; message?: string },
}));

vi.mock("@/lib/db/orders", () => ({
  findLiveOrder: async (id: string, phone: string) => {
    if (!state.order) return null;
    const norm = (v: string) => v.replace(/\D/g, "").replace(/^880/, "0");
    if (state.order.id !== id.trim().toUpperCase()) return null;
    if (norm(state.order.customer.phone) !== norm(phone)) return null;
    return state.order;
  },
}));

vi.mock("@/lib/env", () => ({
  isServiceRoleConfigured: () => true,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => ({
    from: () => ({
      upsert: async (row: Record<string, unknown>) => {
        if (state.nextErr) return { error: state.nextErr };
        if (state.tableMissing) {
          return { error: { code: "42P01", message: 'relation "public.customer_push_subscriptions" does not exist' } };
        }
        state.saved.push(row);
        return { error: null };
      },
      delete: () => ({
        eq: async (_c: string, endpoint: string) => {
          state.deleted.push(endpoint);
          return { error: null };
        },
      }),
      select: async () => ({
        count: state.tableMissing ? null : 2,
        error: state.tableMissing ? { code: "42P01", message: "does not exist" } : null,
      }),
    }),
  }),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, retryAfterSec: 0 }),
  clientIpFromHeaders: () => "1.2.3.4",
}));

import { DELETE, GET, POST } from "@/app/api/track/push/route";

const post = (body: unknown) =>
  new Request("http://x/api/track/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/shopper-1",
  keys: { p256dh: "pkey", auth: "authkey" },
};

beforeEach(() => {
  state.order = null;
  state.saved = [];
  state.deleted = [];
  state.tableMissing = false;
  state.keys = true;
  state.nextErr = null;
  process.env.PUSH_VAPID_PUBLIC_KEY = "BTestPublicKey";
  process.env.PUSH_VAPID_PRIVATE_KEY = "test-private";
});

describe("/api/track/push", () => {
  it("refuses to subscribe without the order's own proof (id + phone)", async () => {
    state.order = { id: "PS-7", customer: { phone: "01712345678" } };

    const noProof = await POST(post({ ...subscription }));
    expect(noProof.status).toBe(400);

    const wrongPhone = await POST(post({ ...subscription, id: "PS-7", phone: "01899999999" }));
    expect(wrongPhone.status).toBe(404);
    const body = (await wrongPhone.json()) as { error: string };
    // Same wording as the tracker: never reveal which half was wrong.
    expect(body.error).toContain("double-check");

    const unknownOrder = await POST(post({ ...subscription, id: "PS-999", phone: "01712345678" }));
    expect(unknownOrder.status).toBe(404);

    expect(state.saved).toEqual([]);
  });

  it("stores the device against the order's canonical phone number", async () => {
    state.order = { id: "PS-7", customer: { phone: "+8801712345678" } };
    const res = await POST(
      post({ ...subscription, id: "ps-7", phone: "01712345678", lang: "en" }),
    );
    expect(res.status).toBe(200);
    expect(state.saved).toHaveLength(1);
    expect(state.saved[0]).toMatchObject({
      endpoint: subscription.endpoint,
      p256dh: "pkey",
      auth: "authkey",
      // Normalised from the ORDER, not from the request body.
      phone: "01712345678",
      lang: "en",
    });
  });

  it("answers 503 naming the migration when the shopper table is missing", async () => {
    state.order = { id: "PS-7", customer: { phone: "01712345678" } };
    state.tableMissing = true;
    const res = await POST(post({ ...subscription, id: "PS-7", phone: "01712345678" }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("202609240001_customer_push.sql");
    expect(state.saved).toEqual([]);
  });

  it("reports what the opt-in card needs: configured, ready, public key", async () => {
    const ok = (await (await GET()).json()) as {
      configured: boolean;
      publicKey: string | null;
      ready: boolean;
      watching: number;
    };
    expect(ok).toMatchObject({ configured: true, publicKey: "BTestPublicKey", ready: true, watching: 2 });

    state.tableMissing = true;
    const notReady = (await (await GET()).json()) as { ready: boolean; watching: number };
    expect(notReady.ready).toBe(false);
    expect(notReady.watching).toBe(0);

    delete process.env.PUSH_VAPID_PUBLIC_KEY;
    delete process.env.PUSH_VAPID_PRIVATE_KEY;
    const off = (await (await GET()).json()) as { configured: boolean; publicKey: string | null };
    expect(off.configured).toBe(false);
    expect(off.publicKey).toBeNull();
  });

  it("forgets a device by endpoint (no proof needed — it is your own browser)", async () => {
    const res = await DELETE(
      new Request("http://x/api/track/push", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      }),
    );
    expect(res.status).toBe(200);
    expect(state.deleted).toEqual([subscription.endpoint]);
  });
});
