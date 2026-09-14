/**
 * P2 #2 — /api/stock-watch: "call me when this is back in stock".
 * Same contract as /api/price-watch: normalized + format-checked number,
 * rate-limited per IP, service-role write, honest 503 when there is no
 * database to promise on.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => {
  const s: {
    serviceConfigured: boolean;
    upserts: { product_id: string; phone: string }[];
    deleteFilters: [string, string][];
    dbError: { message: string } | null;
    makeDb: () => unknown;
  } = {
    serviceConfigured: true,
    upserts: [],
    deleteFilters: [],
    dbError: null,
    makeDb: () => {
      const from = (table: string) => {
        if (table === "stock_watches") {
          const del: Record<string, unknown> = { data: null, error: null };
          del.eq = (col: string, val: string) => {
            s.deleteFilters.push([col, val]);
            return del;
          };
          return {
            upsert: (vals: { product_id: string; phone: string }) => {
              if (s.dbError) throw new Error(s.dbError.message);
              s.upserts.push(vals);
              return { data: null, error: null };
            },
            delete: () => del,
          };
        }
        return { select: () => ({ data: [], error: null }) };
      };
      return { from };
    },
  };
  return s;
});

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => state.makeDb(),
}));

vi.mock("@/lib/env", () => ({
  isServiceRoleConfigured: () => state.serviceConfigured,
}));

import { POST, DELETE } from "../stock-watch/route";
import { __resetRateLimits } from "@/lib/rate-limit";

const req = (body: unknown, method: "POST" | "DELETE" = "POST"): Request =>
  new Request("http://localhost/api/stock-watch", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  __resetRateLimits();
  state.serviceConfigured = true;
  state.upserts = [];
  state.deleteFilters = [];
  state.dbError = null;
});

describe("POST /api/stock-watch (P2 #2)", () => {
  it("saves one watch per (product, phone), normalizing the number", async () => {
    const res = await POST(req({ productId: "p1", phone: "+880 1700-000000" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ waiting: true });
    expect(state.upserts).toEqual([{ product_id: "p1", phone: "01700000000" }]);
  });

  it("rejects an unreachable number with a field error", async () => {
    const res = await POST(req({ productId: "p1", phone: "123" }));
    expect(res.status).toBe(422);
    const data = (await res.json()) as { fields?: Record<string, string> };
    expect(data.fields?.phone).toBeTruthy();
    expect(state.upserts).toHaveLength(0);
  });

  it("refuses to promise when there is no database", async () => {
    state.serviceConfigured = false;
    const res = await POST(req({ productId: "p1", phone: "01700000000" }));
    expect(res.status).toBe(503);
    expect(state.upserts).toHaveLength(0);
  });

  it("a write failure is a 503, not a crash", async () => {
    state.dbError = { message: "boom" };
    const res = await POST(req({ productId: "p1", phone: "01700000000" }));
    expect(res.status).toBe(503);
  });

  it("rate-limits a flood from one address", async () => {
    for (let i = 0; i < 12; i++) {
      expect((await POST(req({ productId: "p1", phone: "01700000000" }))).status).toBe(201);
    }
    const res = await POST(req({ productId: "p1", phone: "01700000000" }));
    expect(res.status).toBe(429);
  });
});

describe("DELETE /api/stock-watch (P2 #2)", () => {
  it("removes exactly that product + number", async () => {
    const res = await DELETE(req({ productId: "p1", phone: "01700000000" }, "DELETE"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ waiting: false });
    expect(state.deleteFilters).toEqual([
      ["product_id", "p1"],
      ["phone", "01700000000"],
    ]);
  });

  it("rejects a malformed body without touching the table", async () => {
    const res = await DELETE(req({ phone: "01700000000" }, "DELETE"));
    expect(res.status).toBe(422);
    expect(state.deleteFilters).toHaveLength(0);
  });
});
