/**
 * /api/cron/tick — the only scheduled door into the app (2026-09-24).
 *
 * Two things must never be wrong here:
 *   • nobody without the secret gets to make the shop send messages — so a
 *     missing or wrong `x-cron-secret` is a 401 that does no work at all;
 *   • an unconfigured host says so (503 + `configured:false`) instead of
 *     reporting a tick that never happened — the same honest-off rule the
 *     push endpoints follow.
 *
 * The jobs themselves are pinned in src/lib/__tests__/cron.test.ts; this file
 * only guards the door.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  ticks: 0,
  serviceReady: true,
}));

vi.mock("@/lib/env", () => ({
  isServiceRoleConfigured: () => state.serviceReady,
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => (state.serviceReady ? { from: () => ({}) } : null),
}));

vi.mock("@/lib/cron", () => ({
  runCronTick: async (input: { now?: Date }) => {
    state.ticks += 1;
    return {
      at: (input.now ?? new Date("2026-09-24T04:00:00.000Z")).toISOString(),
      jobs: [{ job: "expire-offers", status: "ran", did: 1, detail: "1 stale rider offer(s) expired" }],
    };
  },
}));

import { GET, POST } from "@/app/api/cron/tick/route";

const call = (headers: Record<string, string> = {}, method = "GET") =>
  method === "POST"
    ? POST(new Request("http://x/api/cron/tick", { method: "POST", headers }))
    : GET(new Request("http://x/api/cron/tick", { headers }));

beforeEach(() => {
  state.ticks = 0;
  state.serviceReady = true;
  delete process.env.CRON_SECRET;
});

describe("/api/cron/tick", () => {
  it("is honest when no scheduler is configured: 503, configured:false, no work done", async () => {
    const res = await call({ "x-cron-secret": "whatever" });
    expect(res.status).toBe(503);
    const body = (await res.json()) as { configured: boolean; error: string };
    expect(body.configured).toBe(false);
    expect(body.error).toContain("CRON_SECRET");
    expect(state.ticks).toBe(0);
  });

  it("refuses a wrong or missing secret without touching the database", async () => {
    process.env.CRON_SECRET = "s3cret-value";

    const missing = await call();
    expect(missing.status).toBe(401);

    const wrong = await call({ "x-cron-secret": "s3cret-valuf" });
    expect(wrong.status).toBe(401);
    expect(((await wrong.json()) as { error: string }).error).toBe("Unauthorized.");

    // A wrong secret with the right shape is still wrong — and a 401 body
    // never repeats what was sent.
    expect(state.ticks).toBe(0);
  });

  it("accepts the secret as a header or as a bearer token, on GET and POST alike", async () => {
    process.env.CRON_SECRET = "s3cret-value";

    const header = await call({ "x-cron-secret": "s3cret-value" });
    expect(header.status).toBe(200);
    const bearer = await call({ authorization: "Bearer s3cret-value" }, "POST");
    expect(bearer.status).toBe(200);

    const body = (await bearer.json()) as { at: string; jobs: { job: string; status: string }[] };
    expect(body.at).toBe("2026-09-24T04:00:00.000Z");
    expect(body.jobs).toEqual([
      { job: "expire-offers", status: "ran", did: 1, detail: "1 stale rider offer(s) expired" },
    ]);
    expect(state.ticks).toBe(2);
  });

  it("says why it cannot run when the service key is missing", async () => {
    process.env.CRON_SECRET = "s3cret-value";
    state.serviceReady = false;
    const res = await call({ "x-cron-secret": "s3cret-value" });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain("SERVICE_ROLE");
    expect(state.ticks).toBe(0);
  });
});
