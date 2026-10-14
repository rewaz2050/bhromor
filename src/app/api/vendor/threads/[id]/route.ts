/**
 * GET/POST/PATCH /api/vendor/threads/:id — one conversation, shop's side.
 *
 * The shop answers as "shop", with its own name on the bubble, and may close
 * the thread when the matter is settled. Ownership is checked through
 * canReadThread, so a shop cannot open another shop's conversation by
 * guessing an id.
 */

import { vendorRoute } from "../../_lib";
import { routeId } from "../../../admin/_lib";
import {
  appendMessage,
  canReadThread,
  closeThread,
  threadMessages,
} from "@/lib/db/customer-threads";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

const idOf = (context: unknown): Promise<string> =>
  routeId(context as { params?: Promise<{ id?: string }> });

export const GET = vendorRoute("threads-read", async (ctx, _request, context) => {
  const id = await idOf(context);
  if (!(await canReadThread(ctx.db, id, { shopId: ctx.shopId }))) {
    return apiError("এই কথোপকথনটি পাওয়া যায়নি।", 404);
  }
  const { messages, reason } = await threadMessages(ctx.db, id);
  if (reason) return apiJson({ messages: [], reason }, reason === "missing_table" ? 501 : 503);
  return apiJson({ messages });
});

export const POST = vendorRoute("threads-reply", async (ctx, request, context) => {
  const id = await idOf(context);
  if (!(await canReadThread(ctx.db, id, { shopId: ctx.shopId }))) {
    return apiError("এই কথোপকথনটি পাওয়া যায়নি।", 404);
  }
  const body = (await request.json().catch(() => null)) as { body?: unknown } | null;
  const text = typeof body?.body === "string" ? body.body.trim().slice(0, 2000) : "";
  if (text.length < 1) return apiError("খালি বার্তা পাঠানো যায় না।", 422);
  // The shopper sees a name on the bubble; a shop with staff can tell who
  // answered. One indexed read, and a plain "Shop" if it comes back empty.
  const { data: shop } = await ctx.db.from("shops").select("name").eq("id", ctx.shopId).single();
  const shopName = (shop as { name?: string } | null)?.name?.trim() || "Shop";
  const outcome = await appendMessage(ctx.db, id, "shop", shopName, text);
  if (outcome === "missing_table") return apiJson({ sent: false, reason: outcome }, 501);
  if (outcome !== "saved") return apiError("বার্তা পাঠানো যায়নি।", 503);
  return apiJson({ sent: true });
});

export const PATCH = vendorRoute("threads-close", async (ctx, _request, context) => {
  const id = await idOf(context);
  if (!(await canReadThread(ctx.db, id, { shopId: ctx.shopId }))) {
    return apiError("এই কথোপকথনটি পাওয়া যায়নি।", 404);
  }
  const outcome = await closeThread(ctx.db, id);
  if (outcome === "missing_table") return apiJson({ closed: false, reason: outcome }, 501);
  if (outcome !== "saved") return apiError("বন্ধ করা যায়নি।", 503);
  return apiJson({ closed: true });
});
