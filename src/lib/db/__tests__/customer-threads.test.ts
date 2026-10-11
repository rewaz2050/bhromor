/**
 * Customer ↔ shop threads (202610110002).
 *
 * The parts worth pinning are the ones that would quietly break the feature:
 * the ownership check that keeps a shop out of another shop's inbox, the
 * unread count the shopper's badge is built from, the shop being resolved from
 * the order rather than the request, and an unmigrated table saying so
 * instead of throwing.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  appendMessage,
  canReadThread,
  listThreads,
  openThread,
  threadMessages,
} from "../customer-threads";

type Result = { data?: unknown; error?: { code?: string; message?: string } | null };

/** Table → queue of results (one per query); records every call and write. */
const fake = (tables: Record<string, Result[]>) => {
  const log: string[] = [];
  const inserts: { table: string; rows: unknown }[] = [];
  const patches: { table: string; patch: Record<string, unknown> }[] = [];
  const make = (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "order", "limit", "not", "is"]) {
      chain[m] = (...a: unknown[]) => {
        log.push(
          `${table}.${m}(${a.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(",")})`,
        );
        return chain;
      };
    }
    chain.insert = (rows: unknown) => {
      inserts.push({ table, rows });
      log.push(`${table}.insert`);
      return chain;
    };
    chain.update = (patch: Record<string, unknown>) => {
      patches.push({ table, patch });
      log.push(`${table}.update`);
      return chain;
    };
    chain.delete = () => {
      log.push(`${table}.delete`);
      return chain;
    };
    chain.single = () => {
      log.push(`${table}.single`);
      return chain;
    };
    chain.then = (ok: (v: unknown) => unknown) => {
      const queue = tables[table] ?? [];
      const r = queue.length > 1 ? queue.shift()! : (queue[0] ?? { data: [] });
      return Promise.resolve({ data: r.data ?? null, error: r.error ?? null }).then(ok);
    };
    return chain;
  };
  return { log, inserts, patches, db: { from: (t: string) => make(t) } as never };
};

const NO_TABLE = { error: { code: "42P01", message: 'relation "customer_threads" does not exist' } };

describe("listThreads", () => {
  it("gives the shopper the last line and how many replies are waiting", async () => {
    const { db } = fake({
      customer_threads: [
        {
          data: [
            {
              id: "t1",
              order_no: "PS-1",
              shop_id: "s1",
              status: "open",
              customer_read_at: "2026-10-11T08:00:00Z",
              created_at: "2026-10-11T07:00:00Z",
              last_message_at: "2026-10-11T09:30:00Z",
            },
          ],
        },
      ],
      customer_messages: [
        {
          data: [
            { id: "m1", thread_id: "t1", sender: "customer", sender_name: "Rahim", body: "Where is it?", created_at: "2026-10-11T07:00:00Z" },
            { id: "m2", thread_id: "t1", sender: "shop", sender_name: "Rafiq Store", body: "Packed, rider on the way.", created_at: "2026-10-11T09:00:00Z" },
            { id: "m3", thread_id: "t1", sender: "shop", sender_name: "Rafiq Store", body: "He is at your gate.", created_at: "2026-10-11T09:30:00Z" },
          ],
        },
      ],
      shops: [{ data: [{ id: "s1", name: "Rafiq Store" }] }],
    });

    const { threads } = await listThreads(db, { phone: "01712345678" });

    expect(threads).toHaveLength(1);
    expect(threads[0]).toMatchObject({
      id: "t1",
      orderNo: "PS-1",
      shopName: "Rafiq Store",
      lastSender: "shop",
      // Two shop replies, both after the shopper last looked.
      unread: 2,
    });
    expect(threads[0].lastBody).toBe("He is at your gate.");
  });

  it("says missing_table rather than throwing when the migration has not run", async () => {
    const { db } = fake({ customer_threads: [NO_TABLE] });
    const out = await listThreads(db, { phone: "01712345678" });
    expect(out.threads).toEqual([]);
    expect(out.reason).toBe("missing_table");
  });

  it("scopes a shop to its own threads", async () => {
    const { db, log } = fake({ customer_threads: [{ data: [] }] });
    await listThreads(db, { shopId: "s9", status: "open" });
    expect(log).toContain("customer_threads.eq(shop_id,s9)");
    expect(log).toContain("customer_threads.eq(status,open)");
  });
});

describe("openThread", () => {
  it("takes the shop from the order, not from the caller", async () => {
    const { db, inserts, log } = fake({
      orders: [{ data: { id: "o1", shop_id: "s7" } }],
      customer_threads: [{ data: { id: "t9" } }],
      customer_messages: [{ data: { id: "m1" } }],
    });

    const out = await openThread(db, {
      phone: "01712345678",
      orderNo: "PS-1",
      body: "Is this in stock?",
      senderName: "Rahim",
    });

    expect(out).toEqual({ threadId: "t9", reason: "saved" });
    expect(log).toContain("orders.eq(order_no,PS-1)");
    expect(inserts[0].rows).toMatchObject({ customer_phone: "01712345678", shop_id: "s7" });
    // The first message is the shopper's own words.
    expect(inserts[1].rows).toMatchObject({ thread_id: "t9", sender: "customer", body: "Is this in stock?" });
  });

  it("refuses an order number that is not there", async () => {
    const { db } = fake({ orders: [{ error: { code: "PGRST116", message: "no rows" } }] });
    const out = await openThread(db, { phone: "01712345678", orderNo: "PS-X", body: "hi", senderName: "R" });
    expect(out.threadId).toBeUndefined();
    expect(out.reason).toBe("error");
  });
});

describe("canReadThread", () => {
  it("lets a shopper read only their own number", async () => {
    const rows = { customer_threads: [{ data: { id: "t1", customer_phone: "01712345678", shop_id: "s1" } }] };
    expect(await canReadThread(fake(rows).db, "t1", { phone: "01712345678" })).toBe(true);
    expect(await canReadThread(fake(rows).db, "t1", { phone: "01700000000" })).toBe(false);
  });

  it("lets a shop read only its own threads", async () => {
    const rows = { customer_threads: [{ data: { id: "t1", customer_phone: "01712345678", shop_id: "s1" } }] };
    expect(await canReadThread(fake(rows).db, "t1", { shopId: "s1" })).toBe(true);
    expect(await canReadThread(fake(rows).db, "t1", { shopId: "s2" })).toBe(false);
  });

  it("refuses when the thread is not there", async () => {
    const { db } = fake({ customer_threads: [{ error: { code: "PGRST116", message: "no rows" } }] });
    expect(await canReadThread(db, "nope", { phone: "01712345678" })).toBe(false);
  });
});

describe("appendMessage", () => {
  it("writes the line and moves the thread to the top", async () => {
    const { db, inserts, patches } = fake({ customer_messages: [{ data: {} }], customer_threads: [{ data: {} }] });
    const out = await appendMessage(db, "t1", "shop", "Rafiq Store", "Packed.");
    expect(out).toBe("saved");
    expect(inserts[0].rows).toMatchObject({ thread_id: "t1", sender: "shop" });
    // Without this the inbox would not reorder and the shopper would not see it.
    expect(patches[0].patch).toHaveProperty("last_message_at");
  });

  it("reports a missing table instead of throwing", async () => {
    const { db } = fake({ customer_messages: [NO_TABLE] });
    expect(await appendMessage(db, "t1", "shop", "S", "hi")).toBe("missing_table");
  });
});

describe("threadMessages", () => {
  it("returns them oldest first, as the UI expects", async () => {
    const { db, log } = fake({
      customer_messages: [
        {
          data: [
            { id: "m1", thread_id: "t1", sender: "customer", sender_name: "Rahim", body: "a", created_at: "2026-10-11T07:00:00Z" },
            { id: "m2", thread_id: "t1", sender: "shop", sender_name: "Shop", body: "b", created_at: "2026-10-11T08:00:00Z" },
          ],
        },
      ],
    });
    const { messages } = await threadMessages(db, "t1");
    expect(log).toContain('customer_messages.order(created_at,{"ascending":true})');
    expect(messages.map((m) => m.body)).toEqual(["a", "b"]);
    expect(messages[1].at).toBe(Date.parse("2026-10-11T08:00:00Z"));
  });
});
