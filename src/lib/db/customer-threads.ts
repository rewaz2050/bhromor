/**
 * Customer ↔ shop conversations (202610110002).
 *
 * Every path from a shopper to a shop so far left the site — the tracker's
 * WhatsApp button, the delay note, the contact form — so nothing was kept and
 * the shop could not answer the person who actually asked. `contact_messages`
 * is a one-way inbox, not a thread.
 *
 * Read by polling, the way the tracker re-reads an order: no third party, no
 * per-message cost, no push dependency. Service-role only; the customer routes
 * scope by session phone and the shop routes by the shop on the vendor token.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const THREADS_TABLE = "customer_threads";
export const MESSAGES_TABLE = "customer_messages";

export type ThreadSender = "customer" | "shop" | "rider" | "platform";
export type ThreadStatus = "open" | "closed";

export interface ThreadMessage {
  id: string;
  sender: ThreadSender;
  senderName: string;
  body: string;
  at: number;
}

export interface ThreadSummary {
  id: string;
  orderNo: string | null;
  shopId: string | null;
  shopName: string | null;
  status: ThreadStatus;
  createdAt: number;
  lastMessageAt: number;
  lastBody: string;
  lastSender: ThreadSender;
  /** Replies the shopper has not opened yet. */
  unread: number;
}

export type ThreadOutcome =
  | "saved"
  /** `202610110002_customer_threads.sql` has not been run — named, not silent. */
  | "missing_table"
  | "error";

const missingTable = (error: { code?: string; message?: string } | null): boolean =>
  error?.code === "42P01" || /does not exist/i.test(error?.message ?? "");

const outcomeOf = (error: { code?: string; message?: string } | null): ThreadOutcome => {
  if (!error) return "saved";
  return missingTable(error) ? "missing_table" : "error";
};

const at = (value: string | null | undefined): number =>
  value ? new Date(value).getTime() : 0;

interface ThreadRow {
  id: string;
  order_no: string | null;
  shop_id: string | null;
  status: ThreadStatus;
  customer_read_at: string | null;
  created_at: string;
  last_message_at: string;
}

interface MessageRow {
  id: string;
  thread_id: string;
  sender: ThreadSender;
  sender_name: string;
  body: string;
  created_at: string;
}

const toMessage = (row: MessageRow): ThreadMessage => ({
  id: row.id,
  sender: row.sender,
  senderName: row.sender_name,
  body: row.body,
  at: at(row.created_at),
});

/**
 * The threads one side can see, newest activity first, each with the last line
 * and — for the shopper — how many replies are waiting.
 *
 * `shopId` scopes the list to one shop; leave it out for the staff inbox,
 * which sees every conversation.
 */
export const listThreads = async (
  db: SupabaseClient,
  filter: { phone?: string; shopId?: string; status?: ThreadStatus; orderNo?: string },
): Promise<{ threads: ThreadSummary[]; reason?: ThreadOutcome }> => {
  let query = db
    .from(THREADS_TABLE)
    .select("id, order_no, shop_id, status, customer_read_at, created_at, last_message_at")
    .order("last_message_at", { ascending: false })
    .limit(50);
  if (filter.phone) query = query.eq("customer_phone", filter.phone);
  if (filter.shopId) query = query.eq("shop_id", filter.shopId);
  if (filter.status) query = query.eq("status", filter.status);
  // The tracker and the vendor order page need one order's thread, not a
  // whole inbox — a shopper who wrote three times gets the same row back.
  if (filter.orderNo) query = query.eq("order_no", filter.orderNo);

  const { data, error } = await query;
  if (error) return { threads: [], reason: outcomeOf(error) };
  const rows = (data ?? []) as unknown as ThreadRow[];
  if (rows.length === 0) return { threads: [] };

  const ids = rows.map((r) => r.id);
  const { data: messages, error: msgError } = await db
    .from(MESSAGES_TABLE)
    .select("id, thread_id, sender, sender_name, body, created_at")
    .in("thread_id", ids)
    .order("created_at", { ascending: true });
  if (msgError) return { threads: [], reason: outcomeOf(msgError) };
  const all = ((messages ?? []) as unknown as MessageRow[]).map(toMessage);
  const threadOf = new Map(
    ((messages ?? []) as unknown as MessageRow[]).map((row) => [row.id, row.thread_id]),
  );

  const shopIds = [...new Set(rows.map((r) => r.shop_id).filter((v): v is string => !!v))];
  const shops =
    shopIds.length > 0
      ? await db.from("shops").select("id, name").in("id", shopIds)
      : { data: [] as { id: string; name: string }[] };
  const shopName = new Map(
    ((shops.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]),
  );

  return {
    threads: rows.map((row) => {
      const own = all.filter((m) => threadOf.get(m.id) === row.id);
      const last = own[own.length - 1];
      const readAt = at(row.customer_read_at);
      return {
        id: row.id,
        orderNo: row.order_no,
        shopId: row.shop_id,
        shopName: row.shop_id ? (shopName.get(row.shop_id) ?? null) : null,
        status: row.status,
        createdAt: at(row.created_at),
        lastMessageAt: at(row.last_message_at),
        lastBody: last?.body ?? "",
        lastSender: last?.sender ?? "customer",
        unread: own.filter((m) => m.sender !== "customer" && m.at > readAt).length,
      };
    }),
  };
};

/**
 * Start a conversation about an order. The shop is resolved from the order
 * row, never taken from the client — a shopper should not be able to open a
 * thread in someone else's shop inbox.
 */
export const openThread = async (
  db: SupabaseClient,
  input: { phone: string; orderNo: string; body: string; senderName: string },
): Promise<{ threadId?: string; reason: ThreadOutcome }> => {
  const { data: order, error: orderError } = await db
    .from("orders")
    .select("id, shop_id")
    .eq("order_no", input.orderNo)
    .single();
  if (orderError || !order) return { reason: outcomeOf(orderError) };
  const shopId = (order as { shop_id: string | null }).shop_id;

  // One conversation per order, not one per message. Without this every
  // message from the tracker opened a fresh thread, so a shopper who wrote
  // three times split one question across three inboxes — and the shop's
  // answer landed in the first one, where the shopper had stopped looking.
  const { data: found, error: foundError } = await db
    .from(THREADS_TABLE)
    .select("id")
    .eq("customer_phone", input.phone)
    .eq("order_no", input.orderNo)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1);
  if (foundError) return { reason: outcomeOf(foundError) };
  const existingId = ((found ?? []) as { id: string }[])[0]?.id;
  if (existingId) {
    const appended = await appendMessage(db, existingId, "customer", input.senderName, input.body);
    return appended === "saved" ? { threadId: existingId, reason: "saved" } : { reason: appended };
  }

  const { data, error } = await db
    .from(THREADS_TABLE)
    .insert({
      customer_phone: input.phone,
      shop_id: shopId,
      order_no: input.orderNo,
    })
    .select("id")
    .single();
  if (error) return { reason: outcomeOf(error) };
  const threadId = (data as { id: string }).id;

  const written = await appendMessage(db, threadId, "customer", input.senderName, input.body);
  if (written !== "saved") return { reason: written };
  return { threadId, reason: "saved" };
};

export const appendMessage = async (
  db: SupabaseClient,
  threadId: string,
  sender: ThreadSender,
  senderName: string,
  body: string,
): Promise<ThreadOutcome> => {
  const { error } = await db.from(MESSAGES_TABLE).insert({
    thread_id: threadId,
    sender,
    sender_name: senderName.slice(0, 80),
    body,
  });
  if (error) return outcomeOf(error);
  const { error: touched } = await db
    .from(THREADS_TABLE)
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", threadId);
  return outcomeOf(touched);
};

export const threadMessages = async (
  db: SupabaseClient,
  threadId: string,
): Promise<{ messages: ThreadMessage[]; reason?: ThreadOutcome }> => {
  const { data, error } = await db
    .from(MESSAGES_TABLE)
    .select("id, thread_id, sender, sender_name, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) return { messages: [], reason: outcomeOf(error) };
  return { messages: ((data ?? []) as unknown as MessageRow[]).map(toMessage) };
};

/**
 * Ownership: a shopper may only read a thread on their own number, a shop only
 * its own threads. Both callers check through this so neither has to remember.
 */
export const canReadThread = async (
  db: SupabaseClient,
  threadId: string,
  owner: { phone?: string; shopId?: string },
): Promise<boolean> => {
  const { data, error } = await db
    .from(THREADS_TABLE)
    .select("id, customer_phone, shop_id")
    .eq("id", threadId)
    .single();
  if (error || !data) return false;
  const row = data as { customer_phone: string; shop_id: string | null };
  if (owner.phone) return row.customer_phone === owner.phone;
  if (owner.shopId) return row.shop_id === owner.shopId;
  return false;
};

/** Opening a thread marks it read for the shopper — that is what unread counts. */
export const markThreadRead = async (
  db: SupabaseClient,
  threadId: string,
): Promise<ThreadOutcome> => {
  const { error } = await db
    .from(THREADS_TABLE)
    .update({ customer_read_at: new Date().toISOString() })
    .eq("id", threadId);
  return outcomeOf(error);
};

export const closeThread = async (
  db: SupabaseClient,
  threadId: string,
): Promise<ThreadOutcome> => {
  const { error } = await db.from(THREADS_TABLE).update({ status: "closed" }).eq("id", threadId);
  return outcomeOf(error);
};
