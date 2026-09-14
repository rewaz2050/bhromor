/** GET /api/admin/warranty?status= — warranty claim list (P1 #14). */
import { listWarrantyClaims } from "@/lib/db/warranty";
import type { WarrantyClaimStatus } from "@/lib/db/warranty";
import { apiJson } from "@/lib/api-response";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

const STATUSES: WarrantyClaimStatus[] = [
  "submitted",
  "under_review",
  "approved",
  "rejected",
];

export const GET = staffRoute(
  "warranty-list",
  async ({ db }, request) => {
    const url = new URL(request.url);
    const raw = (url.searchParams.get("status") ?? "").trim();
    const orderNo = (url.searchParams.get("order") ?? "").trim();
    const claims = await listWarrantyClaims(db, {
      status: STATUSES.includes(raw as WarrantyClaimStatus)
        ? (raw as WarrantyClaimStatus)
        : undefined,
      orderNo: orderNo === "" ? undefined : orderNo,
    });
    return apiJson({ claims });
  },
);
