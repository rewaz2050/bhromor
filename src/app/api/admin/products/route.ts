/**
 * Staff catalog reads/writes (§71–74).
 * GET → all products incl. drafts + categories.
 * POST → create a product (fields + variant grid + media).
 */
import { createProduct, listProductsFull } from "@/lib/db/admin";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("products-list", async ({ db }) => {
  const { products, categories } = await listProductsFull(db);
  return apiJson({ products, categories });
});

export const POST = staffRoute(
  "products-create",
  async ({ db }, request) => {
    const body: unknown = await request.json().catch(() => null);
    const product = await createProduct(db, body);
    return apiJson({ product }, 201);
  },
  { limit: 30 },
);
