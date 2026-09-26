/**
 * Apply = sign up (2026-09-26): the two public application routes pass the
 * form password to the intake, answer with the account outcome, and turn
 * the intake's "email already has a login" refusal into a 409 the form can
 * show. Both stay 503 on an unconfigured backend (see public-routes.test.ts
 * for the shop route's 503 + rate limit).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  configured: true,
  shopApply: vi.fn(),
  riderApply: vi.fn(),
  notified: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, isServiceRoleConfigured: () => state.configured };
});

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServer: async () => null,
  getSupabaseService: () => ({ service: true }),
  getSupabaseAnon: () => null,
}));

vi.mock("@/lib/db/engagement", () => ({
  notifyStaff: async (_db: unknown, input: Record<string, unknown>) => {
    state.notified.push(input);
  },
}));

vi.mock("@/lib/db/marketplace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/marketplace")>();
  return { ...actual, applyShop: (...args: unknown[]) => state.shopApply(...args) };
});

vi.mock("@/lib/db/riders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/riders")>();
  return { ...actual, applyRider: (...args: unknown[]) => state.riderApply(...args) };
});

import { ApplicantAccountError } from "@/lib/db/applicant-account";
import { RiderInputError } from "@/lib/db/riders";
import { POST as shopsApply } from "../shops/apply/route";
import { POST as ridersApply } from "../riders/apply/route";

let ipCounter = 0;
const post = (path: string, body: unknown): Request =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // A fresh client per request keeps the 5/min limiter out of the way.
      "x-forwarded-for": `10.7.${Math.floor(ipCounter / 250)}.${(ipCounter++ % 250) + 1}`,
    },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  state.configured = true;
  state.notified = [];
  state.shopApply.mockReset();
  state.riderApply.mockReset();
});

describe("POST /api/shops/apply (apply = sign up)", () => {
  it("passes the password to the intake and reports the created login", async () => {
    state.shopApply.mockResolvedValue({ id: "shop-1", userId: "u-1", accountCreated: true });
    const res = await shopsApply(
      post("/api/shops/apply", { name: "Arian Fashion", password: "secret1" }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      applied: true,
      id: "shop-1",
      linked: true,
      account: "created",
    });
    expect(state.shopApply).toHaveBeenCalledWith(
      { name: "Arian Fashion", password: "secret1" },
      { applicantUserId: undefined, password: "secret1" },
    );
    expect(state.notified[0]).toMatchObject({ href: "/admin/shops" });
  });

  it("reports a reused login as 'existing'", async () => {
    state.shopApply.mockResolvedValue({ id: "shop-1", userId: "u-old", accountCreated: false });
    const res = await shopsApply(post("/api/shops/apply", { name: "X", password: "secret1" }));
    await expect(res.json()).resolves.toMatchObject({ account: "existing" });
  });

  it("surfaces the intake's account refusal with its status", async () => {
    state.shopApply.mockRejectedValue(
      new ApplicantAccountError("This email already has a PROSANTI login.", 409),
    );
    const res = await shopsApply(post("/api/shops/apply", { name: "X", password: "secret1" }));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: /already has a PROSANTI login/ });
  });

  it("stays 503 while the service role is missing", async () => {
    state.configured = false;
    const res = await shopsApply(post("/api/shops/apply", { name: "X", password: "secret1" }));
    expect(res.status).toBe(503);
    expect(state.shopApply).not.toHaveBeenCalled();
  });
});

describe("POST /api/riders/apply (apply = sign up)", () => {
  it("passes the password to the intake and reports the created login", async () => {
    state.riderApply.mockResolvedValue({ id: "rider-1", userId: "u-1", accountCreated: true });
    const res = await ridersApply(
      post("/api/riders/apply", { name: "Tanvir", password: "secret1" }),
    );
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toMatchObject({
      applied: true,
      id: "rider-1",
      linked: true,
      account: "created",
    });
    expect(state.riderApply).toHaveBeenCalledWith(
      { name: "Tanvir", password: "secret1" },
      { applicantUserId: undefined, password: "secret1" },
    );
    expect(state.notified[0]).toMatchObject({ href: "/admin/riders" });
  });

  it("surfaces intake validation and account refusals with their status", async () => {
    state.riderApply.mockRejectedValue(new RiderInputError("Choose at least one delivery zone."));
    // RiderInputError defaults to 422 (slice 6 convention).
    expect((await ridersApply(post("/api/riders/apply", { name: "T" }))).status).toBe(422);

    state.riderApply.mockRejectedValue(new ApplicantAccountError("taken", 409));
    expect((await ridersApply(post("/api/riders/apply", { name: "T" }))).status).toBe(409);
  });

  it("stays 503 while the service role is missing", async () => {
    state.configured = false;
    const res = await ridersApply(post("/api/riders/apply", { name: "T", password: "secret1" }));
    expect(res.status).toBe(503);
    expect(state.riderApply).not.toHaveBeenCalled();
  });
});
