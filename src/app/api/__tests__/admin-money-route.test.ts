/**
 * /api/admin/money (202609300002 — audit item M/D):
 *   GET   — money position + payout queue + rates (ready:false pre-migration);
 *   POST  — a payout decision needs an id, a decision and a reference/note;
 *   PATCH — the three pay rates are validated before they touch site_settings.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

// Two distinguishable clients. ps_is_admin() / ps_rider_id() read auth.uid(),
// which is NULL on the service-role client — so the RPCs MUST get the staff's
// own JWT client (the 2026-10-01 audit's N1/N2: service-role calls were all
// answered "forbidden" in production).
const STAFF_DB = vi.hoisted(() => ({ kind: "staff-jwt" }));
const SERVICE_CLIENT = vi.hoisted(() => ({ kind: "service-role" }));

const state = vi.hoisted(() => ({
  ctx: {} as Record<string, unknown>,
  decisions: [] as unknown[],
  /** Which client object each RPC-bearing helper received. */
  summaryClient: null as unknown,
  pnlCall: null as null | { client: unknown; window: { from: string | null } },
  pnlFails: false,
  decideClients: null as null | { staffDb: unknown; service: unknown },
  settingsWrites: [] as unknown[],
  summary: { riderPayable: 14000 } as unknown,
  queue: { pending: [], decided: [] } as unknown,
}));

// The real staffRoute wrapper runs (auth is the only faked part), so its
// AdminInputError → status mapping is what the assertions see.
vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class StaffAuthError extends Error {},
  requireStaff: async () => state.ctx,
  requireStaffRole: async () => state.ctx,
}));

vi.mock("@/lib/supabase-server", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/supabase-server")>();
  return { ...orig, getSupabaseService: () => SERVICE_CLIENT };
});

vi.mock("@/lib/db/rider-money", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/db/rider-money")>();
  const { AdminInputError } = await import("@/lib/db/admin");
  return {
    ...orig,
    getAdminMoneyPnl: async (client: unknown, window: unknown) => {
      state.pnlCall = { client, window: window as { from: string | null } };
      if (state.pnlFails) throw new Error("pnl boom");
      return { commission: 100 };
    },
    getAdminMoneySummary: async (client: unknown) => {
      state.summaryClient = client;
      return state.summary;
    },
    listRiderPayoutQueue: async () => state.queue,
    readRiderPaySettings: async () => ({ baseFee: 4000, codHandlingFee: 1000, minPayout: 1000 }),
    writeRiderPaySettings: async (_db: unknown, raw: unknown) => {
      const body = (raw as { settings?: unknown })?.settings ?? raw;
      const { settings, error } = orig.parseRiderPaySettings(body);
      if (error) throw new AdminInputError(error, 422);
      state.settingsWrites.push(body);
      return settings;
    },
    decideRiderPayout: async (staffDb: unknown, service: unknown, _user: unknown, input: unknown) => {
      state.decideClients = { staffDb, service };
      state.decisions.push(input);
      return { id: (input as { payoutId: string }).payoutId, status: "paid" };
    },
  };
});

import { GET, PATCH, POST } from "../admin/money/route";

const call = (method: "GET" | "POST" | "PATCH") =>
  (method === "GET" ? GET : method === "POST" ? POST : PATCH) as unknown as (
    request: Request,
  ) => Promise<Response>;

const request = (body?: unknown, method = "GET") =>
  new Request("http://localhost/api/admin/money", {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  state.ctx = { user: { id: "staff-1", email: "owner@prosanti.test" }, db: STAFF_DB, role: "admin" };
  state.decisions = [];
  state.summaryClient = null;
  state.pnlCall = null;
  state.pnlFails = false;
  state.decideClients = null;
  state.settingsWrites = [];
  state.summary = { riderPayable: 14000 };
  state.queue = { pending: [], decided: [] };
});

describe("GET /api/admin/money", () => {
  it("answers the summary, queue and rates", async () => {
    const res = await call("GET")(request());
    const body = (await res.json()) as { ready: boolean; settings: { baseFee: number } };
    expect(res.status).toBe(200);
    expect(body.ready).toBe(true);
    expect(body.settings.baseFee).toBe(4000);
  });

  it("reads the summary with the STAFF JWT client, never the service key", async () => {
    await call("GET")(request());
    expect(state.summaryClient).toBe(STAFF_DB);
    expect(state.summaryClient).not.toBe(SERVICE_CLIENT);
  });

  it("says not-ready when the migration has not run", async () => {
    state.summary = null;
    const body = (await (await call("GET")(request())).json()) as { ready: boolean };
    expect(body.ready).toBe(false);
  });
});

describe("GET /api/admin/money — net result (N7)", () => {
  const get = async (qs = "") => {
    const res = await call("GET")(new Request(`http://localhost/api/admin/money${qs}`));
    return (await res.json()) as { range: string; pnl: { commission: number } | null; ready: boolean };
  };

  it("defaults to 30 days and reads with the staff client", async () => {
    const body = await get();
    expect(body.range).toBe("30d");
    expect(body.pnl?.commission).toBe(100);
    expect(state.pnlCall?.client).toBe(STAFF_DB);
  });

  it("honours ?range=all (open window) and ignores junk", async () => {
    expect((await get("?range=all")).range).toBe("all");
    expect(state.pnlCall?.window.from).toBeNull();
    expect((await get("?range=banana")).range).toBe("30d");
  });

  it("a failing P&L never blocks the page", async () => {
    state.pnlFails = true;
    const body = await get();
    expect(body.ready).toBe(true);
    expect(body.pnl).toBeNull();
  });
});

describe("POST /api/admin/money", () => {
  it("records a paid decision with its reference", async () => {
    const res = await call("POST")(
      request({ payoutId: "11111111-1111-1111-1111-111111111111", decision: "paid", reference: "TRX1" }, "POST"),
    );
    expect(res.status).toBe(200);
    expect(state.decisions).toHaveLength(1);
  });

  it("decides with the STAFF JWT client (ps_is_admin needs auth.uid())", async () => {
    await call("POST")(
      request({ payoutId: "11111111-1111-1111-1111-111111111111", decision: "paid", reference: "TRX1" }, "POST"),
    );
    expect(state.decideClients?.staffDb).toBe(STAFF_DB);
    // The service client is only for the display-only e-mail stamp.
    expect(state.decideClients?.service).toBe(SERVICE_CLIENT);
  });

  it("wants a reference or a note for a payment", async () => {
    const res = await call("POST")(
      request({ payoutId: "11111111-1111-1111-1111-111111111111", decision: "paid" }, "POST"),
    );
    expect(res.status).toBe(422);
    expect(state.decisions).toHaveLength(0);
  });

  it("rejects an unknown payout id before the RPC", async () => {
    const res = await call("POST")(request({ payoutId: "nope", decision: "rejected" }, "POST"));
    expect(res.status).toBe(422);
    expect(state.decisions).toHaveLength(0);
  });

  it("accepts a rejection with only a reason", async () => {
    const res = await call("POST")(
      request(
        { payoutId: "11111111-1111-1111-1111-111111111111", decision: "rejected", note: "bKash failed" },
        "POST",
      ),
    );
    expect(res.status).toBe(200);
    expect(state.decisions[0]).toMatchObject({ decision: "rejected", note: "bKash failed" });
  });
});

describe("PATCH /api/admin/money", () => {
  it("saves validated paisa rates", async () => {
    const res = await call("PATCH")(
      request({ settings: { baseFee: 4000, codHandlingFee: 1000, minPayout: 500 } }, "PATCH"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { settings: { minPayout: number } };
    expect(body.settings.minPayout).toBe(500);
    expect(state.settingsWrites).toHaveLength(1);
  });

  it("refuses a bad rate instead of zeroing it", async () => {
    const res = await call("PATCH")(
      request({ settings: { baseFee: "x", codHandlingFee: 0, minPayout: 0 } }, "PATCH"),
    );
    expect(res.status).toBe(422);
    expect(state.settingsWrites).toHaveLength(0);
  });
});
