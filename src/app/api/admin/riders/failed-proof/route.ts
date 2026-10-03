/**
 * Staff → failed-delivery photo setting (202610020020).
 * GET   — { mode } (0 off — the default, 1 optional, 2 required)
 * PATCH — { mode } — admin / super-admin only; written through the staff member's own client.
 */
import { apiJson } from "@/lib/api-response";
import { readFailedProofMode, writeFailedProofMode } from "@/lib/db/failed-proof";
import { staffRoute } from "../../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("failed-proof-mode", async ({ db }) => apiJson({ mode: await readFailedProofMode(db) }));

export const PATCH = staffRoute(
  "failed-proof-mode-save",
  async ({ db }, request) => {
    const body = (await request.json().catch(() => null)) as { mode?: unknown } | null;
    return apiJson({ mode: await writeFailedProofMode(db, body?.mode) });
  },
  { limit: 20, roles: ["admin", "super_admin"] },
);
