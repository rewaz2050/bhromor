/** Shared strict input validation; privileged identity/approval fields never pass. */
export class ProfileInputError extends Error {}

export function profileBody(raw: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ProfileInputError("সঠিক তথ্য দিন।");
  const body = raw as Record<string, unknown>;
  if (Object.keys(body).some(key => !allowed.includes(key))) throw new ProfileInputError("এই তথ্য পরিবর্তন করা যাবে না।");
  return body;
}
export function profileName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 80) throw new ProfileInputError("নাম ২–৮০ অক্ষরের হতে হবে।");
  return name;
}
export function riderProfileInput(raw: unknown) {
  const body = profileBody(raw, ["name", "phone", "vehicle"]);
  const patch: { name?: string; phone?: string; vehicle?: "bicycle" | "bike" | "scooter" } = {};
  if (body.name !== undefined) patch.name = profileName(body.name);
  if (body.phone !== undefined) {
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    if (!/^01[0-9]{9}$/.test(phone)) throw new ProfileInputError("১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন।");
    patch.phone = phone;
  }
  if (body.vehicle !== undefined) {
    if (!["bicycle", "bike", "scooter"].includes(String(body.vehicle))) throw new ProfileInputError("যানবাহন বেছে নিন।");
    patch.vehicle = body.vehicle as "bicycle" | "bike" | "scooter";
  }
  if (Object.keys(patch).length === 0) throw new ProfileInputError("বদলানোর মতো তথ্য দিন।");
  return patch;
}
