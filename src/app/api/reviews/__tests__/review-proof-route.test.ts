/**
 * POST /api/reviews with a purchase proof (UX plan §4/§7, R10): the track
 * page's order no + phone (or the signed-in account) is re-checked against
 * a delivered order that contains the piece. Proven → verified + phone +
 * order_ref stored, `stampEligible: true`. Unproven → the same review,
 * unverified, no phone kept — the form is never trusted on its own.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  inserts: [] as Record<string, unknown>[],
  /** Fail inserts that carry the proof columns (migration not run yet). */
  rejectProofColumns: false,
  proofCalls: [] as { phone: string; productId: string; orderNo?: string }[],
  /** Which phones the order store proves for product p1. */
  provenPhones: [] as string[],
  customer: null as { phone: string } | null,
  staffNotes: [] as string[],
}));

vi.mock("@/lib/env", () => ({
  isServiceRoleConfigured: () => true,
  isSupabaseConfigured: () => true,
}));

vi.mock("@/lib/supabase-server", () => {
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    let pending: Record<string, unknown> | null = null;
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: table === "products" ? { id: "p1" } : null, error: null });
    chain.insert = (row: Record<string, unknown> | Record<string, unknown>[]) => {
      pending = Array.isArray(row) ? row[0]! : row;
      if (table === "reviews") state.inserts.push(pending);
      return chain;
    };
    chain.single = async () => {
      if (table !== "reviews" || !pending) return { data: null, error: null };
      if (state.rejectProofColumns && "customer_phone" in pending) {
        return { data: null, error: { code: "42703", message: "column customer_phone does not exist" } };
      }
      return {
        data: {
          id: "11111111-1111-4111-8111-111111111111",
          shop_id: "s1",
          product_id: "p1",
          customer_id: null,
          created_at: "2026-09-27T10:00:00Z",
          ...pending,
        },
        error: null,
      };
    };
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok);
    return chain;
  };
  return {
    getSupabaseService: () => ({ from }),
    getSupabaseServer: async () => ({ from }),
  };
});

vi.mock("@/lib/db/orders", () => ({
  provenPurchase: async (_db: unknown, input: { phone: string; productId: string; orderNo?: string }) => {
    state.proofCalls.push(input);
    return input.productId === "p1" && state.provenPhones.includes(input.phone)
      ? { orderNo: input.orderNo ?? "PS-20260920-0001" }
      : null;
  },
}));

vi.mock("@/lib/customer-auth", () => ({
  resolveCustomer: async () => state.customer,
}));

vi.mock("@/lib/db/engagement", () => ({
  notifyStaff: async (_db: unknown, input: { title: string }) => {
    state.staffNotes.push(input.title);
  },
}));

import { POST as postReview } from "../route";
import { __resetRateLimits } from "@/lib/rate-limit";

const post = (body: unknown): Request =>
  new Request("http://localhost/api/reviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const base = { productId: "p1", author: "Rahim", rating: 5, body: "Lovely fabric, fits well on me." };

beforeEach(() => {
  __resetRateLimits();
  state.inserts = [];
  state.rejectProofColumns = false;
  state.proofCalls = [];
  state.provenPhones = [];
  state.customer = null;
  state.staffNotes = [];
});

describe("POST /api/reviews — purchase proof", () => {
  it("stores a proven review as verified with phone + order ref and promises a stamp", async () => {
    state.provenPhones = ["01711111111"];
    const res = await postReview(post({ ...base, orderId: "ps-20260920-0001", phone: "+880 1711-111111" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { stampEligible: boolean; review: { verified: boolean } };
    expect(body.stampEligible).toBe(true);
    expect(body.review.verified).toBe(true);
    expect(state.proofCalls[0]).toEqual({ phone: "01711111111", productId: "p1", orderNo: "ps-20260920-0001" });
    expect(state.inserts[0]).toMatchObject({
      verified: true,
      customer_phone: "01711111111",
      order_ref: "ps-20260920-0001",
      status: "pending",
    });
    expect(state.staffNotes).toEqual(["Review awaiting moderation"]);
  });

  it("keeps an unproven review unverified and never stores the claimed phone", async () => {
    const res = await postReview(post({ ...base, orderId: "PS-1", phone: "01799999999" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { stampEligible: boolean; review: { verified: boolean } };
    expect(body.stampEligible).toBe(false);
    expect(body.review.verified).toBe(false);
    expect(state.inserts[0]).not.toHaveProperty("customer_phone");
    expect(state.inserts[0]).toMatchObject({ verified: false });
  });

  it("falls back to the signed-in account's phone when the form carries no proof", async () => {
    state.customer = { phone: "01722222222" };
    state.provenPhones = ["01722222222"];
    const res = await postReview(post(base));
    expect(res.status).toBe(201);
    expect((await res.json()).stampEligible).toBe(true);
    expect(state.proofCalls).toEqual([{ phone: "01722222222", productId: "p1", orderNo: undefined }]);
    expect(state.inserts[0]).toMatchObject({ verified: true, customer_phone: "01722222222" });
  });

  it("still saves the review (unverified) when the proof columns are not migrated yet", async () => {
    state.provenPhones = ["01711111111"];
    state.rejectProofColumns = true;
    const res = await postReview(post({ ...base, orderId: "PS-20260920-0001", phone: "01711111111" }));
    expect(res.status).toBe(201);
    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[1]).not.toHaveProperty("customer_phone");
    expect(state.inserts[1]).toMatchObject({ verified: true });
  });
});
