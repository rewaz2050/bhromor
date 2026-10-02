/**
 * Two network steps of the rider's delivery flow, lifted out of the page
 * (item Z) so their branches can be tested without rendering anything.
 * Neither throws: a failure comes back as `{ ok: false, message }`.
 */

export type ProofUpload = { ok: true; url: string } | { ok: false; message: string };

interface SignResponse {
  cloudName?: string;
  apiKey?: string;
  timestamp?: number;
  folder?: string;
  signature?: string;
  uploadUrl?: string;
  error?: string;
}

/**
 * Photo proof → Cloudinary through a RIDER-scoped signature (the staff
 * `/api/media/sign` answers 403 to a rider session).
 */
export const uploadDeliveryProof = async (file: File): Promise<ProofUpload> => {
  try {
    const signRes = await fetch("/api/rider/media/sign", { method: "POST" });
    const sign = (await signRes.json().catch(() => null)) as SignResponse | null;
    if (!signRes.ok || !sign?.cloudName || !sign.uploadUrl) {
      return {
        ok: false,
        message:
          sign?.error ||
          (signRes.status === 503
            ? "Photo upload is not configured yet — you can still deliver without a photo."
            : "ছবি আপলোড এখন সম্ভব হচ্ছে না — আবার চেষ্টা করুন, না হলে নিচে কারণ লিখে ডেলিভারি করুন।"),
      };
    }
    const form = new FormData();
    form.append("file", file);
    form.append("api_key", sign.apiKey ?? "");
    form.append("timestamp", String(sign.timestamp ?? ""));
    form.append("folder", sign.folder ?? "");
    form.append("signature", sign.signature ?? "");
    const upRes = await fetch(sign.uploadUrl, { method: "POST", body: form });
    const up = (await upRes.json().catch(() => null)) as { secure_url?: string; error?: { message?: string } } | null;
    if (!upRes.ok || !up?.secure_url) {
      return { ok: false, message: up?.error?.message || "Upload failed" };
    }
    return { ok: true, url: up.secure_url };
  } catch (e) {
    return { ok: false, message: e instanceof Error && e.message ? e.message : "Photo upload failed" };
  }
};

export type FailedAttempt = { ok: true; message: string } | { ok: false; message: string };

interface FailedResponse {
  final?: boolean;
  attempts?: number;
  maxAttempts?: number;
  error?: string;
}

/** What the rider is told after a failed attempt was recorded. */
export const failedAttemptMessage = (d: FailedResponse | null): string =>
  d?.final
    ? "শেষ চেষ্টা ব্যর্থ — পার্সেল দোকানে ফেরত দিন। অ্যাডমিন বাকিটা দেখবেন।"
    : `ব্যর্থ চেষ্টা নথিভুক্ত (${d?.attempts ?? "?"}/${d?.maxAttempts ?? "?"}) — আবার চেষ্টা করতে পারেন`;

export const reportFailedAttempt = async (assignmentId: string, reason: string): Promise<FailedAttempt> => {
  try {
    const res = await fetch(`/api/rider/assignments/${assignmentId}/failed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const d = (await res.json().catch(() => null)) as FailedResponse | null;
    if (res.ok) return { ok: true, message: failedAttemptMessage(d) };
    return { ok: false, message: d?.error || "Failed — try again." };
  } catch {
    return { ok: false, message: "Failed — try again." };
  }
};

export type ReleaseJob = { ok: true; message: string } | { ok: false; message: string };

/**
 * The rider hands back a job they accepted but have not picked up. The server
 * needs a reason (≥ 5 characters) and puts the order back in the area queue.
 */
export const releaseAcceptedJob = async (assignmentId: string, reason: string): Promise<ReleaseJob> => {
  try {
    const res = await fetch(`/api/rider/assignments/${assignmentId}/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const d = (await res.json().catch(() => null)) as { error?: string } | null;
    if (res.ok) return { ok: true, message: "কাজটি ফেরত দেওয়া হয়েছে — অর্ডারটি অন্য রাইডারদের কাছে যাবে।" };
    return { ok: false, message: d?.error || "ফেরত দেওয়া যায়নি — আবার চেষ্টা করুন।" };
  } catch {
    return { ok: false, message: "ফেরত দেওয়া যায়নি — আবার চেষ্টা করুন।" };
  }
};
