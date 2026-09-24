/**
 * The free WhatsApp outbox (2026-09-24) — "a draft, not a bot".
 *
 * The owner asked whether the WhatsApp Business API was needed to tell a
 * shopper about every step. It is not, and it is not free either: the API
 * needs a Meta business account, a number (the shop's own only via BSP-run
 * Coexistence), pre-approved templates per language and ~$0.011 per utility
 * message to Bangladesh — ~10 taka an order for this seven-step journey.
 *
 * A `wa.me` deep link costs nothing: it opens the shop's OWN WhatsApp
 * Business app with the text already written and a human taps send. So this
 * module is the fallback half of the customer-notification layer:
 *
 *   • push already goes out on every order step (free, automatic);
 *   • when that reached NO device (the shopper never tapped the opt-in card,
 *     or every device is dead) the same message becomes a DRAFT here, and the
 *     shop's order page offers it as one tap.
 *
 * Honesty rules, same posture as the rest of the store:
 *   • the text is built from `notify-messages.ts` — the SAME copy the push
 *     used, so the phone and the WhatsApp draft can never disagree;
 *   • the row records `opened_at`, never `sent_at`: the browser cannot see
 *     inside the WhatsApp app, and claiming a human sent it would be a lie.
 *     Staff "not needed" is a deliberate dismissal, also recorded;
 *   • a newer step SUPERSEDES a pending older one, so a shopper never gets
 *     "order confirmed" after "the rider has your parcel";
 *   • nothing here ever throws — a missing table (migration not pasted) is
 *     reported as a reason and the shop keeps working exactly as before.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { customerPushMessage, type CustomerEventKind } from "./notify-messages";
import { absoluteUrl } from "./site-url";
import { isPlausibleBdPhone, normalizeBdPhone } from "./phone";
import { waLink } from "./whatsapp-order";
import type { Language } from "./translations";

export const WA_OUTBOX_MIGRATION = "supabase/migrations/202609240003_wa_outbox.sql";

export interface WaDraftRow {
  id: string;
  orderNo: string;
  phone: string;
  kind: CustomerEventKind;
  lang: Language;
  message: string;
  createdAt: string;
}

/**
 * The prefilled WhatsApp text for one order step.
 *
 * Title and body come straight from the push copy; only the track line is
 * added, because a push notification carries its link in the tap while a
 * WhatsApp message must spell it out. The link is absolute (site-url), since
 * a relative `/track` inside a chat is meaningless.
 */
export const waDraftText = (input: {
  kind: CustomerEventKind;
  orderNo: string;
  phone: string | null | undefined;
  total?: number | null;
  lang?: Language;
}): string => {
  const message = customerPushMessage({
    kind: input.kind,
    orderNo: input.orderNo,
    phone: input.phone,
    total: input.total ?? null,
    lang: input.lang,
  });
  const track = absoluteUrl(message.href);
  const label = (input.lang ?? "bn") === "en" ? "Track it" : "ট্র্যাক করুন";
  return `${message.title}\n${message.body}\n\n${label}: ${track}`;
};

export type WaQueueOutcome =
  /** The draft is waiting for the shop. */
  | "queued"
  /** This step was already queued for this order (unique order_no + kind). */
  | "duplicate"
  /** The number is not a plausible BD mobile — a chat link would go nowhere. */
  | "bad_phone"
  /** `202609240003_wa_outbox.sql` has not been run — named, not silent. */
  | "missing_table"
  | "error";

/** Same mapping the push tables use: a missing table must sound different. */
const missingTable = (error: { code?: string; message?: string } | null | undefined): boolean => {
  if (!error) return false;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
};

/**
 * Write (or find) the draft for one order step. Called by the push fan-out
 * when it reached nobody — see `pushOrderMilestone`. Never throws.
 */
export const queueWaDraft = async (
  db: SupabaseClient,
  input: {
    orderNo: string;
    phone: string | null | undefined;
    kind: CustomerEventKind;
    total?: number | null;
    lang?: Language;
  },
): Promise<WaQueueOutcome> => {
  const orderNo = (input.orderNo ?? "").trim().toUpperCase().slice(0, 40);
  const phone = normalizeBdPhone(input.phone ?? "");
  if (!orderNo) return "error";
  if (!isPlausibleBdPhone(phone)) return "bad_phone";
  const lang: Language = input.lang === "en" ? "en" : "bn";
  const message = waDraftText({ ...input, orderNo, phone, lang });

  try {
    const { error } = await db.from("wa_outbox").insert({
      order_no: orderNo,
      phone,
      kind: input.kind,
      lang,
      message,
    });
    if (error) {
      if ((error as { code?: string }).code === "23505") return "duplicate";
      if (missingTable(error)) return "missing_table";
      console.warn("[wa-outbox] queue failed", orderNo, input.kind, error.message);
      return "error";
    }
  } catch (err) {
    if (missingTable(err as { code?: string; message?: string })) return "missing_table";
    console.warn("[wa-outbox] queue threw", orderNo, input.kind);
    return "error";
  }

  // A newer step wins: anything still pending for this order is stale now, and
  // sending "order confirmed" after "the rider has your parcel" would confuse
  // the shopper more than silence. Best-effort — the draft is already stored.
  try {
    await db
      .from("wa_outbox")
      .update({ superseded_at: new Date().toISOString() })
      .eq("order_no", orderNo)
      .is("opened_at", null)
      .is("superseded_at", null)
      .is("dismissed_at", null)
      .neq("kind", input.kind);
  } catch {
    // Ignore: the newest draft is what the panel shows first anyway.
  }

  return "queued";
};

const rowToDraft = (row: Record<string, unknown>): WaDraftRow => ({
  id: String(row.id ?? ""),
  orderNo: String(row.order_no ?? ""),
  phone: String(row.phone ?? ""),
  kind: String(row.kind ?? "") as CustomerEventKind,
  lang: row.lang === "en" ? "en" : "bn",
  message: String(row.message ?? ""),
  createdAt: String(row.created_at ?? ""),
});

const SELECT = "id, order_no, phone, kind, lang, message, created_at";

/**
 * Whatever is waiting for the shop: one order's queue (the order page panel)
 * or the whole shop's (the orders-page strip). `ready: false` means the
 * migration has not been run — the caller says so instead of showing "0".
 */
export const listWaDrafts = async (
  db: SupabaseClient,
  options: { orderNo?: string; limit?: number } = {},
): Promise<{ ready: boolean; drafts: WaDraftRow[] }> => {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
  try {
    const base = db
      .from("wa_outbox")
      .select(SELECT)
      .is("opened_at", null)
      .is("superseded_at", null)
      .is("dismissed_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);
    const scoped = options.orderNo
      ? base.eq("order_no", options.orderNo.trim().toUpperCase())
      : base;
    const { data, error } = await scoped;
    if (error) {
      return { ready: !missingTable(error), drafts: [] };
    }
    return { ready: true, drafts: (data ?? []).map((r) => rowToDraft(r as Record<string, unknown>)) };
  } catch (err) {
    return { ready: !missingTable(err as { code?: string; message?: string }), drafts: [] };
  }
};

/** Close a draft: `opened` = the WhatsApp tap, `dismissed` = staff said no. */
export const closeWaDraft = async (
  db: SupabaseClient,
  id: string,
  action: "opened" | "dismissed",
): Promise<boolean> => {
  const clean = (id ?? "").trim();
  if (clean === "") return false;
  try {
    const { error } = await db
      .from("wa_outbox")
      .update({ [action === "opened" ? "opened_at" : "dismissed_at"]: new Date().toISOString() })
      .eq("id", clean);
    if (error) {
      console.warn("[wa-outbox] close failed", clean, action, error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

/** Health probe: is the outbox table there, and how many drafts wait? */
export const waOutboxReady = async (
  db: SupabaseClient,
): Promise<{ ready: boolean; count: number }> => {
  try {
    const { count, error } = await db
      .from("wa_outbox")
      .select("id", { count: "exact", head: true })
      .is("opened_at", null)
      .is("superseded_at", null)
      .is("dismissed_at", null);
    if (error) return { ready: !missingTable(error), count: 0 };
    return { ready: true, count: count ?? 0 };
  } catch {
    return { ready: false, count: 0 };
  }
};

/**
 * The one-tap link for a draft — `https://wa.me/…?text=…`, or null when the
 * row carries a number that is not a BD mobile (the panel disables the button
 * instead of opening a chat to nowhere).
 */
export const waDraftLink = (draft: Pick<WaDraftRow, "phone" | "message">): string | null =>
  waLink(draft.phone, draft.message);
