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
  const name = profileName(body.name);
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  if (!/^01[0-9]{9}$/.test(phone)) throw new ProfileInputError("১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন।");
  if (!["bicycle", "bike", "scooter"].includes(String(body.vehicle))) throw new ProfileInputError("যানবাহন বেছে নিন।");
  return { name, phone, vehicle: body.vehicle as "bicycle" | "bike" | "scooter" };
}
