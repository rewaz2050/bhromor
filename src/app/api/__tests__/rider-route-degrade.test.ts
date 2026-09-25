/**
 * The shared /api/rider/* wrapper must translate "database behind the app"
 * errors (pending migrations) into an honest rider-readable 503 — the raw
 * Postgres text ("function ps_… does not exist") never reaches the phone.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/rider-auth", () => ({
  requireRider: async () => ({
    user: { id: "user-1" },
    rider: { id: "rider-1", name: "R", phone: "01700000000", vehicle: "bike", status: "active" },
    db: {},
    service: {},
    email: "r@x.com",
  }),
  RiderAuthError: class extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: () => ({ allowed: true }) }));

import { riderRoute } from "../rider/_lib";

describe("riderRoute — pending-migration errors", () => {
  it("maps a missing-function failure to a 503 with the Bangla notice", async () => {
    const handler = vi.fn(async () => {
      throw new Error("function public.ps_expire_stale_offers(p_force => boolean) does not exist");
    });
    const route = riderRoute("probe", handler);
    const res = await route(new Request("http://localhost/probe"));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("ব্যাকএন্ড আপডেট");
    // The raw SQL text stays on the server.
    expect(body.error).not.toContain("ps_expire_stale_offers");
  });

  it("keeps domain error messages untouched", async () => {
    const handler = vi.fn(async () => {
      throw new Error("rider jobs read failed");
    });
    const route = riderRoute("probe", handler);
    const res = await route(new Request("http://localhost/probe"));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("rider jobs read failed");
  });
});
