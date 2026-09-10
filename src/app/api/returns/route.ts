/** POST /api/returns — request return/exchange pickup (Sunamganj Sadar) */
import { validateOrderPayload } from "@/lib/order-validation";
import { OrderPlacementError, loadOrderSnapshot, placeLiveOrder } from "@/lib/db/orders";
import { isServiceRoleConfigured } from "@/lib/env";
import { apiError, apiJson } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isServiceRoleConfigured()) {
    return apiJson({ demoMode: true as const, id: `RET-${Date.now()}` });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return apiError("Invalid return data.", 400);
  }

  const body = payload as Record<string, unknown>;
  const parentId = (body.return_parent_id || body.returnParentId || "").toString().trim();
  const reason = (body.return_reason || body.returnReason || "").toString().trim();
  if (!parentId) return apiError("return_parent_id required", 422);
  if (!reason) return apiError("return_reason required", 422);

  try {
    const snapshot = await loadOrderSnapshot();
    if (!snapshot) return apiError("Ordering not set up", 503);

    // Inject return flags into payload so validateOrderPayload picks them up
    (body as any).is_return = true;
    (body as any).return_parent_id = parentId;
    (body as any).return_reason = reason;

    const validation = validateOrderPayload(payload, snapshot);
    if (!validation.ok) {
      return apiError("Please fix fields", 422, { errors: validation.errors });
    }
    // Ensure return flags in draft
    (validation.draft as any).isReturn = true;
    (validation.draft as any).returnParentId = parentId;
    (validation.draft as any).returnReason = reason;

    const order = await placeLiveOrder(validation.draft, snapshot);
    if (!order) return apiError("Could not request return", 503);
    return apiJson({ id: order.id }, 201);
  } catch (err) {
    if (err instanceof OrderPlacementError) {
      return apiError(err.message, err.status, { field: err.field });
    }
    return apiError((err as any)?.message || "return failed", 500);
  }
}
