/**
 * Staff categories (§5).
 * GET → full ordered list. POST → upsert {…category} or { action:"move", id, dir }.
 */
import {
  AdminInputError,
  listCategoriesFull,
  moveCategoryRow,
  upsertCategory,
} from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("categories-list", async ({ db }) => {
  const categories = await listCategoriesFull(db);
  return apiJson({ categories });
});

export const POST = staffRoute(
  "categories-write",
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
      const categories = await moveCategoryRow(db, body.id, body.dir);
      return apiJson({ categories });
    }
    const category = await upsertCategory(db, body);
    return apiJson({ category });
  },
  { limit: 30 },
);
