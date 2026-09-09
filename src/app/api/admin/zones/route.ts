/**
 * Staff delivery zones (§20–21).
 * GET → full list incl. inactive. POST → upsert zone or { action:"move", id, dir }.
 */
import {
  AdminInputError,
  listZonesFull,
  moveZoneRow,
  upsertZone,
} from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("zones-list", async ({ db }) => {
  const zones = await listZonesFull(db);
  return apiJson({ zones });
});

export const POST = staffRoute(
  "zones-write",
  async ({ db }, request) => {
    const body = (await request.json().catch(() => null)) as {
      action?: string;
      id?: string;
      dir?: number;
    } | null;
    if (!body) throw new AdminInputError("Invalid request.");
    if (body.action === "move") {
      if (typeof body.id !== "string" || (body.dir !== 1 && body.dir !== -1)) {
        throw new AdminInputError("Invalid move.");
      }
      const zones = await moveZoneRow(db, body.id, body.dir);
      return apiJson({ zones });
    }
    const zone = await upsertZone(db, body);
    return apiJson({ zone });
  },
  { limit: 30 },
);
