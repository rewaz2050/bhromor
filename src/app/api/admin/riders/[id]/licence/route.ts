/**
 * GET/PATCH /api/admin/riders/:id/licence — item N. Staff read and record the
 * driving-licence expiry date (from the licence photo). PATCH {expiresOn:
 * "YYYY-MM-DD" | null}; null clears it.
 */
import { apiError, apiJson } from "@/lib/api-response";
import { getRiderLicence, setRiderLicenceExpiry } from "@/lib/db/licence-expiry";
import { RiderInputError } from "@/lib/db/riders";
import { staffRoute, routeId } from "../../../_lib";

export const dynamic = "force-dynamic";

const validId = (id: string): boolean => /^[0-9a-f-]{36}$/i.test(id);

export const GET = staffRoute(
  "rider-licence",
  async ({ db }, _request, context) => {
    const id = await routeId(context);
    if (!validId(id)) return apiError("A valid rider id is required.", 422);
    try {
      const licence = await getRiderLicence(db, id);
      return apiJson({ ready: licence !== null, licence });
    } catch (err) {
      if (err instanceof RiderInputError) return apiError(err.message, err.status);
      throw err;
    }
  },
  { limit: 60 },
);

export const PATCH = staffRoute(
  "rider-licence-set",
  async ({ db }, request, context) => {
    const id = await routeId(context);
    if (!validId(id)) return apiError("A valid rider id is required.", 422);
    const body = (await request.json().catch(() => null)) as { expiresOn?: unknown } | null;
    if (!body || !("expiresOn" in body) || (body.expiresOn !== null && typeof body.expiresOn !== "string")) {
      return apiError("expiresOn must be a YYYY-MM-DD date or null.", 422);
    }
    try {
      const licence = await setRiderLicenceExpiry(db, id, body.expiresOn === null ? null : (body.expiresOn as string).trim());
      return apiJson({ ready: true, licence });
    } catch (err) {
      if (err instanceof RiderInputError) return apiError(err.message, err.status);
      throw err;
    }
  },
  { limit: 30 },
);
