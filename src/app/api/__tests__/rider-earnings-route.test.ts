/**
 * /api/rider/earnings (202609300002 — audit item N).
 * GET answers ready:false before the migration runs (no fake zeros); POST
 * converts taka → paisa, validates the account field and hands refusals the
 * rider can read.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// ps_rider_money_summary resolves the rider through auth.uid(), which is NULL
// on the service-role client — it MUST get the rider's own JWT client.
const RIDER_DB = vi.hoisted(() => ({ kind: "rider-jwt" }));
const SERVICE = vi.hoisted(() => ({ kind: "service-role" }));

const state = vi.hoisted(() => ({
  summaryClients: [] as unknown[],
  requested: [] as unknown[],
  summary: null as unknown,
  entries: [] as unknown[],
  payouts: [] as unknown[],
  ctx: {} as Record<string, unknown>,
}));

// The real route wrapper is under test: only the session check is faked, so
// its error mapping (RiderInputError → status) is exercised for real.
vi.mock("@/lib/rider-auth", () => ({
  RiderAuthError: class RiderAuthError extends Error {},
  requireRider: async () => state.ctx,
}));

vi.mock("@/lib/db/rider-money", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/rider-money")>();
  return {
    ...orig,
    getRiderMoneySummary: async (client: unknown) => {
      state.summaryClients.push(client);
      return state.summary;
    },
    listRiderMoneyEntries: async () => state.entries,
    listRiderPayouts: async () => state.payouts,
    requestRiderPayout: async (_db: unknown, input: unknown) => {
      state.requested.push(input);
      return { id: "p1", amount: (input as { amount: number }).amount, status: "pending" };
    },
  };
});

import { GET, POST } from "../rider/earnings/route";

const callGet = () => GET(new Request("http://localhost/api/rider/earnings"));

const callPost = (body: unknown) =>
  POST(
    new Request("http://localhost/api/rider/earnings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  state.requested = [];
  state.summaryClients = [];
  state.summary = null;
  state.entries = [];
  state.payouts = [];
  state.ctx = {
    rider: { id: "r1", cashInHand: 220000 },
    db: RIDER_DB,
    service: SERVICE,
    user: { id: "u1" },
    email: "rider@example.com",
  };
});

describe("GET /api/rider/earnings", () => {
  it("reports ready:false while the migration is pending", async () => {
    const body = (await (await callGet()).json()) as { ready: boolean; summary: unknown };
    expect(body.ready).toBe(false);
    expect(body.summary).toBeNull();
  });

  it("reads the statement with the rider's JWT client, never the service key", async () => {
    await callGet();
    expect(state.summaryClients).toEqual([RIDER_DB]);
  });

  it("answers the statement, feed and payout history when ready", async () => {
    state.summary = { balance: 14000, cashInHand: 220000 };
    state.entries = [{ id: "e1", kind: "tip", amount: 5000 }];
    state.payouts = [{ id: "p1", status: "pending" }];
    const body = (await (await callGet()).json()) as {
      ready: boolean;
      entries: unknown[];
      payouts: unknown[];
      cashInHand: number;
    };
    expect(body.ready).toBe(true);
    expect(body.entries).toHaveLength(1);
    expect(body.payouts).toHaveLength(1);
    expect(body.cashInHand).toBe(220000);
  });
});

describe("POST /api/rider/earnings", () => {
  it("converts taka to paisa and passes the destination through", async () => {
    const res = await callPost({ amount: 50, method: "bkash", account: "01700000000" });
    expect(res.status).toBe(201);
    expect(state.requested).toEqual([{ amount: 5000, method: "bkash", account: "01700000000" }]);
  });

  it("refreshes the summary with the rider's JWT client after a request", async () => {
    await callPost({ amount: 50, method: "bkash", account: "01700000000" });
    expect(state.summaryClients).toEqual([RIDER_DB]);
  });

  it("refuses a nonsense amount", async () => {
    const res = await callPost({ amount: "abc", method: "bkash", account: "01700000000" });
    expect(res.status).toBe(422);
    expect(state.requested).toHaveLength(0);
  });

  it("requires an account for anything but cash", async () => {
    const res = await callPost({ amount: 50, method: "bkash", account: "017" });
    expect(res.status).toBe(422);
    expect(state.requested).toHaveLength(0);
    const cash = await callPost({ amount: 50, method: "cash", account: "" });
    expect(cash.status).toBe(201);
  });

  it("refuses more than ten withdrawal requests a minute", async () => {
    // A fresh rider id: the limiter is per rider + route, and the earlier
    // POST tests in this file already spent tokens from "u1"'s bucket.
    state.ctx = { ...state.ctx, user: { id: "u-rate-limit" } };
    for (let i = 0; i < 10; i += 1) {
      expect((await callPost({ amount: 1, method: "cash", account: "" })).status).toBe(201);
    }
    expect((await callPost({ amount: 1, method: "cash", account: "" })).status).toBe(429);
  });
});
