/** Staff → riders announcements (202610020001). GET lists, POST posts (broadcast or one rider). */
import { apiError, apiJson } from "@/lib/api-response";
import { listAddressableRiders, listAnnouncementsForStaff, postAnnouncement } from "@/lib/db/rider-inbox";
import { parseAnnouncementInput } from "@/lib/rider-inbox";
import { staffRoute } from "../_lib";

export const dynamic = "force-dynamic";

export const GET = staffRoute("rider-announcements", async ({ db }) => {
  const items = await listAnnouncementsForStaff(db);
  const riders = items === null ? [] : await listAddressableRiders(db);
  return apiJson({ ready: items !== null, items: items ?? [], riders });
});

export const POST = staffRoute(
  "rider-announcements-post",
  async ({ db }, request) => {
    const input = parseAnnouncementInput(await request.json().catch(() => null));
    if ("error" in input) return apiError(input.error, 422);
    try {
      const id = await postAnnouncement(db, input);
      return apiJson({ ok: true, id }, 201);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "rider_not_found") return apiError("রাইডার পাওয়া যায়নি।", 404);
      if (msg === "forbidden") return apiError("এই কাজের অনুমতি নেই।", 403);
      throw err;
    }
  },
  { limit: 20 },
);
