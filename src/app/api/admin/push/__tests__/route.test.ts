/**
 * /api/admin/push — staff device registration for the phone-notification
 * pipeline: status honesty (configured/keys), subscription validation
 * (https + both keys), and unsubscribe.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const upserted: Record<string, unknown>[] = [];
const deleted: string[] = [];
vi.mock("@/lib/staff-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/staff-auth")>("@/lib/staff-auth");
  return {
    ...actual,
    requireStaff: async () => ({
      user: { id: "staff-1", email: "s@x.com" },
      role: "admin",
      db: {
        from: (name: string) => ({
          upsert: async (row: Record<string, unknown>) => {
            if (name !== "push_subscriptions") return { error: { message: "no" } };
            upserted.push(row);
            return { error: null };
          },
          delete: () => ({
            eq: async (_c: string, endpoint: string) => {
              deleted.push(endpoint);
              return { error: null };
            },
          }),
          select: () => ({
            limit: async () => ({ data: [{ endpoint: "https://push/x" }], error: null }),
          }),
        }),
      },
    }),
  };
});

import { DELETE, GET, POST } from "../route";

const jsonRequest = (body: unknown, method = "POST"): Request =>
  new Request("http://x/api/admin/push", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  upserted.length = 0;
  deleted.length = 0;
  process.env.PUSH_VAPID_PUBLIC_KEY = "BPub";
  process.env.PUSH_VAPID_PRIVATE_KEY = "Priv";
});

afterEach(() => {
  delete process.env.PUSH_VAPID_PUBLIC_KEY;
  delete process.env.PUSH_VAPID_PRIVATE_KEY;
});

describe("admin push registrations", () => {
  it("status: configured true with the public key, and 503-honest when keys are missing", async () => {
    const ok = await GET();
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { configured: boolean; publicKey: string | null };
    expect(body.configured).toBe(true);
    expect(body.publicKey).toBe("BPub");

    delete process.env.PUSH_VAPID_PUBLIC_KEY;
    delete process.env.PUSH_VAPID_PRIVATE_KEY;
    const off = (await GET()) as Response;
    expect(off.status).toBe(200);
    const offBody = (await off.json()) as { configured: boolean; publicKey: string | null };
    expect(offBody.configured).toBe(false);
    expect(offBody.publicKey).toBeNull();
  });

  it("subscribe: 503 while unconfigured, 422 on a bad subscription, 200 on a good one", async () => {
    delete process.env.PUSH_VAPID_PUBLIC_KEY;
    delete process.env.PUSH_VAPID_PRIVATE_KEY;
    expect((await POST(jsonRequest({ endpoint: "https://p/1", keys: { p256dh: "k", auth: "a" } }))).status).toBe(503);

    process.env.PUSH_VAPID_PUBLIC_KEY = "BPub";
    process.env.PUSH_VAPID_PRIVATE_KEY = "Priv";
    expect((await POST(jsonRequest({ endpoint: "http://insecure", keys: { p256dh: "k", auth: "a" } }))).status).toBe(422);
    expect((await POST(jsonRequest({ endpoint: "https://p/1", keys: { p256dh: "k" } }))).status).toBe(422);

    const good = await POST(jsonRequest({ endpoint: "https://p/1", keys: { p256dh: "k", auth: "a" } }));
    expect(good.status).toBe(200);
    expect(upserted).toEqual([{ endpoint: "https://p/1", p256dh: "k", auth: "a" }]);
  });

  it("unsubscribe forgets the endpoint", async () => {
    const res = await DELETE(jsonRequest({ endpoint: "https://p/1" }, "DELETE"));
    expect(res.status).toBe(200);
    expect(deleted).toEqual(["https://p/1"]);
  });
});
