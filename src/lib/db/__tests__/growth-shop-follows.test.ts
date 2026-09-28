/**
 * B1 (2026-09-28) — shop follows.
 *
 * The row is "tell this number when this shop publishes something new". Two
 * honesty rules ride on the fan-out and are asserted here:
 *   • only followers who ticked "send me news" (`marketing_ok`) are messaged;
 *   • the numbers the push could not reach come back as a call list — they are
 *     never silently dropped, because a shop that cannot notify can still call.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  followers: [] as {
    id: string;
    phone: string;
    marketing_ok: boolean | null;
    last_notified_at: string | null;
    created_at: string;
  }[],
  upserts: [] as { shop_id: string; phone: string; marketing_ok: boolean }[],
  deleteCalls: [] as string[],
  filters: [] as [string, string][],
  /** Phones the push reported as reached — everything else is a call. */
  reached: [] as string[],
  pushCalls: [] as {
    phones: unknown;
    kind: string;
    productName: string;
    pricePaisa?: number | null;
    href?: string | null;
  }[],
  /** phone batches handed to the last-notified stamp */
  stampCalls: [] as string[][],
  upsertOpts: [] as unknown[],
  shopName: "রঙধনু বস্ত্রালয়",
  readError: null as { message: string } | null,
  /** How many of the next delete calls should fail. */
  deletePasses: 0,
  /** How many of the next shop-name reads should throw. */
  namePasses: 0,
  service: null as unknown,
}));

vi.mock("@/lib/customer-push", () => ({
  pushProductEvent: async (_db: unknown, input: Record<string, unknown>) => {
    state.pushCalls.push(input as never);
    return {
      accepted: state.reached.length,
      devices: state.reached.length,
      reached: state.reached,
    };
  },
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => state.service,
}));

/** Phones a payload named, in order — accepts the raw or the wrapped shape. */
const phonesOf = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.filter((p): p is string => typeof p === "string");
  const listed = (value as { phones?: unknown } | null)?.phones;
  return Array.isArray(listed)
    ? listed.filter((p): p is string => typeof p === "string")
    : [];
};

const chain = (data: unknown, error: unknown = null) => {
  const obj: Record<string, unknown> = { data, error };
  obj.select = () => obj;
  obj.eq = (col: string, val: unknown) => {
    state.filters.push([col, String(val)]);
    return obj;
  };
  obj.order = () => obj;
  obj.limit = () => obj;
  obj.in = () => obj;
  obj.maybeSingle = () => obj;
  return obj;
};

const fakeDb = (): SupabaseClient =>
  ({
    from: (table: string) => {
      switch (table) {
        case "shop_follows":
          return {
            select: () =>
              state.readError
                ? chain(null, state.readError)
                : chain(state.followers),
            upsert: (
              vals: { shop_id: string; phone: string; marketing_ok: boolean },
              opts?: unknown,
            ) => {
              state.upserts.push(vals);
              state.upsertOpts.push(opts);
              return { data: null, error: null };
            },
            delete: () => {
              state.deleteCalls.push(table);
              const obj: Record<string, unknown> = { data: null, error: null };
              // `.delete().eq(...).eq(...)` — both links return the same
              // awaited result, and a queued failure lands on the second one.
              obj.eq = (col: string, val: string) => {
                state.filters.push([col, val]);
                if (state.deletePasses > 0) {
                  state.deletePasses -= 1;
                  obj.error = { message: "down" };
                }
                return obj;
              };
              return obj;
            },
            update: () => ({
              eq: () => ({
                in: (_col: string, phones: string[]) => {
                  state.stampCalls.push(phones);
                  return { data: null, error: null };
                },
              }),
            }),
          };
        case "shops":
          return {
            select: () => {
              if (state.namePasses > 0) {
                state.namePasses -= 1;
                return chain(null, { message: "down" });
              }
              return chain({ name: state.shopName });
            },
          };
        default:
          return { select: () => chain([]) };
      }
    },
  }) as unknown as SupabaseClient;

import {
  announceNewProductToFollowers,
  createShopFollow,
  deleteShopFollow,
  flagNewProductForFollowers,
  listShopFollows,
} from "@/lib/db/growth";

const follower = (
  phone: string,
  marketingOk = true,
  lastNotifiedAt: string | null = null,
) => ({
  id: `f-${phone}`,
  phone,
  marketing_ok: marketingOk,
  last_notified_at: lastNotifiedAt,
  created_at: "2026-09-27T06:00:00.000Z",
});

beforeEach(() => {
  state.followers = [];
  state.upserts = [];
  state.deleteCalls = [];
  state.filters = [];
  state.reached = [];
  state.pushCalls = [];
  state.stampCalls = [];
  state.upsertOpts = [];
  state.shopName = "রঙধনু বস্ত্রালয়";
  state.readError = null;
  state.deletePasses = 0;
  state.namePasses = 0;
  state.service = fakeDb();
});

describe("following a shop (B1)", () => {
  it("upserts one row per (shop, phone) with the shopper's own consent", async () => {
    const db = fakeDb();
    await createShopFollow(db, {
      shopId: "s1",
      phone: "017 1234-5678",
      marketingOk: false,
    });
    expect(state.upserts).toEqual([
      { shop_id: "s1", phone: "01712345678", marketing_ok: false },
    ]);
    // Following twice refreshes the same row — the unique key does the dedupe.
    expect(state.upsertOpts[0]).toEqual({ onConflict: "shop_id,phone" });

    // Default (no explicit tick in the body) is consent — the card is the ask.
    await createShopFollow(db, { shopId: "s1", phone: "01712345678" });
    expect(state.upserts[1].marketing_ok).toBe(true);
  });

  it("removes the row the shopper's own number owns, and reports failure", async () => {
    const db = fakeDb();
    await deleteShopFollow(db, { shopId: "s1", phone: "01712345678" });
    expect(state.filters).toEqual([
      ["shop_id", "s1"],
      ["phone", "01712345678"],
    ]);

    state.deletePasses = 1;
    await expect(
      deleteShopFollow(db, { shopId: "s1", phone: "01712345678" }),
    ).rejects.toThrow("shop follow delete failed");
  });

  it("reads the shop's own list newest-first and normalizes the flags", async () => {
    state.followers = [
      follower("01712345678", true, "2026-09-28T05:00:00.000Z"),
      { ...follower("01812345678"), marketing_ok: null },
    ];
    const rows = await listShopFollows(fakeDb(), "s1");
    expect(rows.map((r) => r.phone)).toEqual(["01712345678", "01812345678"]);
    expect(rows[0].lastNotifiedAt).toBe("2026-09-28T05:00:00.000Z");
    // A null flag reads as consent (the column default) — never as a refusal.
    expect(rows[1].marketingOk).toBe(true);
    expect(state.filters).toContainEqual(["shop_id", "s1"]);
  });

  it("reads an empty list instead of throwing when the table is missing", async () => {
    state.readError = { message: "relation does not exist" };
    expect(await listShopFollows(fakeDb(), "s1")).toEqual([]);
  });
});

describe("publishing a new product (B1)", () => {
  it("pushes only the followers who asked for news, then stamps who heard it", async () => {
    state.followers = [
      follower("01712345678"),
      follower("01812345678", false),
      follower("01912345678"),
    ];
    state.reached = ["01712345678"];

    const result = await flagNewProductForFollowers(fakeDb(), {
      shopId: "s1",
      productName: "হাতে বোনা শাড়ি",
      productSlug: "hate-bona-sari",
      pricePaisa: 124000,
    });

    expect(state.pushCalls).toHaveLength(1);
    expect(phonesOf(state.pushCalls[0].phones)).toEqual([
      "01712345678",
      "01912345678",
    ]);
    expect(state.pushCalls[0].kind).toBe("new-from-shop");
    expect(state.pushCalls[0].href).toBe("/product/hate-bona-sari");
    expect(state.pushCalls[0].pricePaisa).toBe(124000);
    // The shop's name rides along so the shopper knows which shelf moved.
    expect(String(state.pushCalls[0].productName)).toContain("রঙধনু বস্ত্রালয়");
    expect(String(state.pushCalls[0].productName)).toContain("হাতে বোনা শাড়ি");

    expect(state.stampCalls).toEqual([["01712345678"]]);
    expect(result).toEqual({
      followers: 3,
      marketing: 2,
      reached: ["01712345678"],
      waiting: ["01912345678"],
    });
  });

  it("hands back every consented number as a call list when no push landed", async () => {
    state.followers = [follower("01712345678"), follower("01812345678")];
    state.reached = [];

    const result = await flagNewProductForFollowers(fakeDb(), {
      shopId: "s1",
      productName: "নতুন কুর্তি",
    });

    expect(result.reached).toEqual([]);
    expect(result.waiting).toEqual(["01712345678", "01812345678"]);
    expect(state.stampCalls).toEqual([]);
  });

  it("does nothing at all when nobody follows the shop", async () => {
    const result = await flagNewProductForFollowers(fakeDb(), {
      shopId: "s1",
      productName: "কিছু",
    });
    expect(result).toEqual({ followers: 0, marketing: 0, reached: [], waiting: [] });
    expect(state.pushCalls).toHaveLength(0);
  });

  it("never messages the followers who declined news", async () => {
    state.followers = [follower("01712345678", false)];
    const result = await flagNewProductForFollowers(fakeDb(), {
      shopId: "s1",
      productName: "নতুন ওড়না",
    });
    expect(state.pushCalls).toHaveLength(0);
    expect(result).toEqual({ followers: 1, marketing: 0, reached: [], waiting: [] });
  });

  it("survives a read failure without breaking the product save", async () => {
    state.readError = { message: "down" };
    const result = await flagNewProductForFollowers(fakeDb(), {
      shopId: "s1",
      productName: "নতুন পণ্য",
    });
    expect(result).toEqual({ followers: 0, marketing: 0, reached: [], waiting: [] });
  });

  it("skips the extra shop read when the caller already passed the name", async () => {
    state.followers = [follower("01712345678")];
    state.reached = ["01712345678"];
    state.namePasses = 1; // would fail if it were read
    const result = await flagNewProductForFollowers(fakeDb(), {
      shopId: "s1",
      shopName: "সোনারগাঁও",
      productName: "পাঞ্জাবি",
    });
    expect(result.reached).toEqual(["01712345678"]);
    expect(String(state.pushCalls[0].productName)).toContain("সোনারগাঁও");
  });
});

describe("announceNewProductToFollowers (the write-path entry point)", () => {
  it("opens the service client itself and runs the fan-out there", async () => {
    // Subscriptions are service-only, so a vendor-session client would read
    // zero devices and the announcement would vanish — this proves the path.
    state.followers = [follower("01712345678")];
    state.reached = ["01712345678"];
    const result = await announceNewProductToFollowers({
      shopId: "s1",
      shopName: "রঙধনু বস্ত্রালয়",
      productName: "জামদানি শাড়ি",
      pricePaisa: 450000,
    });
    expect(result.reached).toEqual(["01712345678"]);
    expect(state.pushCalls).toHaveLength(1);
  });

  it("stays quiet (and safe) when the service key is not configured", async () => {
    state.service = null;
    const result = await announceNewProductToFollowers({
      shopId: "s1",
      productName: "কিছু",
    });
    expect(result).toEqual({ followers: 0, marketing: 0, reached: [], waiting: [] });
    expect(state.pushCalls).toHaveLength(0);
  });
});
