import { apiJson } from "@/lib/api-response";
import { RiderInputError } from "@/lib/db/riders";
import { normalizePhone } from "@/lib/orders";
import { mapRider } from "@/lib/db/mappers";
import type { DbRider } from "@/lib/db/types";
import { riderRoute } from "../_lib";

export const dynamic = "force-dynamic";

/** GET /api/rider/me — authenticated rider session probe. */
export const GET = riderRoute("me", async (ctx) => {
  return apiJson({
    rider: ctx.rider,
    email: ctx.email,
  });
});

/** PATCH /api/rider/me — rider edits only their public identity fields. */
export const PATCH = riderRoute(
  "profile",
  async (ctx, request) => {
    const body = (await request.json().catch(() => null)) as {
      name?: unknown;
      phone?: unknown;
      vehicle?: unknown;
    } | null;
    const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    const phone = typeof body?.phone === "string" ? normalizePhone(body.phone) : "";
    const vehicle = body?.vehicle;
    if (name.length < 2 || name.length > 80) {
      throw new RiderInputError("নাম ২–৮০ অক্ষরের হতে হবে।", 422);
    }
    if (!/^01[0-9]{9}$/.test(phone)) {
      throw new RiderInputError("সঠিক ১১ সংখ্যার মোবাইল নম্বর দিন।", 422);
    }
    if (vehicle !== "bicycle" && vehicle !== "bike" && vehicle !== "scooter") {
      throw new RiderInputError("সঠিক যানবাহন বাছাই করুন।", 422);
    }

    const { data, error } = await ctx.service
      .from("riders")
      .update({ name, phone, vehicle })
      .eq("id", ctx.rider.id)
      .select("*")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new RiderInputError("এই মোবাইল নম্বরটি অন্য রাইডারের অ্যাকাউন্টে আছে।", 409);
      }
      throw new RiderInputError("প্রোফাইল সেভ করা যায়নি — আবার চেষ্টা করুন।", 500);
    }
    if (!data) throw new RiderInputError("রাইডার প্রোফাইল পাওয়া যায়নি।", 404);
    return apiJson({ rider: mapRider(data as DbRider), email: ctx.email });
  },
  { limit: 10 },
);
