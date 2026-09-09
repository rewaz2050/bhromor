import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

import { POST as contactPost } from "../contact/route";
import { POST as subscribePost } from "../newsletter/subscribe/route";
import { GET as unsubscribeGet } from "../newsletter/unsubscribe/route";
import { GET as homepageGet } from "../homepage/route";
import { GET as messagesGet } from "../admin/messages/route";
import { GET as newsletterGet } from "../admin/newsletter/route";
import { GET as homepageAdminGet } from "../admin/homepage/route";
import { GET as mediaGet } from "../admin/media/route";
import { GET as notificationsGet } from "../admin/notifications/route";
import { GET as settingsGet } from "../admin/settings/route";
import { __resetRateLimits } from "@/lib/rate-limit";

const get = (path: string): Request => new Request(`http://localhost${path}`);
const send = (path: string, method: string, body: unknown): Request =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const goodContact = {
  name: "Rahim Uddin",
  phone: "01712345678",
  topic: "Order support",
  message: "My order has not arrived yet, please help.",
};

describe("engagement public routes in demo mode (no Supabase keys)", () => {
  beforeEach(() => __resetRateLimits());

  it("contact: 422 on invalid input, demoMode on valid", async () => {
    const bad = await contactPost(send("/api/contact", "POST", { name: "x" }));
    expect(bad.status).toBe(422);
    const ok = await contactPost(send("/api/contact", "POST", goodContact));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ demoMode: true });
  });

  it("newsletter subscribe: 422 on bad email, demoMode on good", async () => {
    const bad = await subscribePost(
      send("/api/newsletter/subscribe", "POST", { email: "nope" }),
    );
    expect(bad.status).toBe(422);
    const ok = await subscribePost(
      send("/api/newsletter/subscribe", "POST", { email: "a@b.com" }),
    );
    expect(await ok.json()).toEqual({ demoMode: true });
  });

  it("newsletter unsubscribe + homepage answer demoMode", async () => {
    const unsub = await unsubscribeGet(
      get("/api/newsletter/unsubscribe?token=abc"),
    );
    expect(await unsub.json()).toEqual({ demoMode: true });
    const home = await homepageGet();
    expect(await home.json()).toEqual({ demoMode: true });
  });
});

describe("engagement admin routes without a session", () => {
  it("401s every new staff endpoint", async () => {
    expect((await messagesGet(get("/api/admin/messages"))).status).toBe(401);
    expect((await newsletterGet(get("/api/admin/newsletter"))).status).toBe(401);
    expect((await homepageAdminGet(get("/api/admin/homepage"))).status).toBe(401);
    expect((await mediaGet(get("/api/admin/messages"))).status).toBe(401);
    expect(
      (await notificationsGet(get("/api/admin/notifications"))).status,
    ).toBe(401);
    expect((await settingsGet(get("/api/admin/settings"))).status).toBe(401);
  });
});
