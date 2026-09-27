"use client";

/**
 * Rider KYC upload card (round 4, 2026-09-26) — shown on /rider/login while
 * the application is pending (or rejected and being fixed).
 *
 * One button per document: the phone camera / gallery opens, the photo goes
 * straight to Cloudinary with a signature from /api/rider/kyc/sign, and the
 * resulting URL is stored via POST /api/rider/kyc. No SMS, no e-mail: staff
 * see the photos on the admin card and approve from there. Bangla copy,
 * Bengali digits, 44 px targets, honest 503 messages when uploads are not
 * configured yet.
 */

import { useEffect, useId, useRef, useState } from "react";
import { bnDigits } from "@/lib/arrival";
import { KYC_DOCS, type KycDocId, type RiderKyc } from "@/lib/rider-kyc";
import { IconCheck, IconImage } from "@/components/ui/icons";

interface KycState {
  kyc: RiderKyc;
  submittedAt: number | null;
  required: KycDocId[];
  missing: KycDocId[];
  complete: boolean;
}

interface SignPayload {
  cloudName?: string;
  apiKey?: string;
  timestamp?: number;
  folder?: string;
  signature?: string;
  uploadUrl?: string;
  error?: string;
}

const readJson = async <T,>(res: Response): Promise<T | null> =>
  (await res.json().catch(() => null)) as T | null;

/** Cloudinary thumbnail for the tick-list (server-side crop). */
const thumb = (url: string): string =>
  url.replace("/image/upload/", "/image/upload/c_fill,w_160,h_120,q_auto,f_auto/");

export default function KycUploadCard({ className = "" }: { className?: string }) {
  const [state, setState] = useState<KycState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyDoc, setBusyDoc] = useState<KycDocId | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const inputs = useRef<Partial<Record<KycDocId, HTMLInputElement | null>>>({});
  const headingId = useId();

  // Initial read — promise callbacks, not a synchronous setState in the
  // effect body (same pattern as useVendorResource).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/rider/kyc", { cache: "no-store" })
      .then(async (res) => {
        const data = await readJson<KycState & { error?: string }>(res);
        if (cancelled) return;
        if (!res.ok || !data) {
          setLoadError(data?.error ?? "কাগজপত্রের তথ্য আনা যায়নি — একটু পরে আবার দেখুন।");
          return;
        }
        setLoadError(null);
        setState(data);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("কাগজপত্রের তথ্য আনা যায়নি — ইন্টারনেট দেখে আবার চেষ্টা করুন।");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const upload = async (doc: KycDocId, file: File) => {
    setBusyDoc(doc);
    setMessage(null);
    try {
      if (!file.type.startsWith("image/")) {
        throw new Error("শুধু ছবি (JPG/PNG) আপলোড করা যাবে।");
      }
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("ছবিটি ১০ MB-এর চেয়ে বড় — ক্যামেরার সাধারণ সেটিংসে আবার তুলুন।");
      }
      const signRes = await fetch("/api/rider/kyc/sign", { method: "POST" });
      const sign = await readJson<SignPayload>(signRes);
      if (!signRes.ok || !sign?.cloudName || !sign.uploadUrl) {
        throw new Error(
          sign?.error ??
            (signRes.status === 503
              ? "ছবি আপলোড এখনো চালু হয়নি — আবেদন জমা আছে, পরে আবার চেষ্টা করুন।"
              : "এই মুহূর্তে আপলোড করা যাচ্ছে না — একটু পরে আবার চেষ্টা করুন।"),
        );
      }
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", sign.apiKey ?? "");
      form.append("timestamp", String(sign.timestamp ?? ""));
      form.append("folder", sign.folder ?? "");
      form.append("signature", sign.signature ?? "");
      const upRes = await fetch(sign.uploadUrl, { method: "POST", body: form });
      const up = await readJson<{ secure_url?: string; error?: { message?: string } }>(upRes);
      if (!upRes.ok || !up?.secure_url) {
        throw new Error(up?.error?.message || "ছবি আপলোড ব্যর্থ হয়েছে — আবার চেষ্টা করুন।");
      }
      const saveRes = await fetch("/api/rider/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc, url: up.secure_url }),
      });
      const saved = await readJson<KycState & { error?: string }>(saveRes);
      if (!saveRes.ok || !saved) {
        throw new Error(saved?.error ?? "ছবিটি সংরক্ষণ করা যায়নি — আবার চেষ্টা করুন।");
      }
      setState(saved);
      setMessage({
        tone: "ok",
        text: saved.complete
          ? "সব কাগজ জমা হয়েছে — অ্যাডমিন যাচাই করে অনুমোদন দেবেন।"
          : "ছবি জমা হয়েছে। বাকি কাগজগুলোও দিয়ে দিন।",
      });
    } catch (err) {
      setMessage({
        tone: "error",
        text: err instanceof Error && err.message ? err.message : "ছবি আপলোড ব্যর্থ হয়েছে।",
      });
    } finally {
      setBusyDoc(null);
    }
  };

  const required = new Set(state?.required ?? []);
  const doneCount = state ? state.required.length - state.missing.length : 0;

  return (
    <section
      aria-labelledby={headingId}
      className={`space-y-3 rounded-3xl border border-line bg-paper p-5 shadow-sm ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="font-display text-base font-bold text-forest-900">
          পরিচয়ের কাগজপত্র (KYC)
        </h3>
        {state && (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
              state.complete ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"
            }`}
          >
            {bnDigits(`${doneCount}/${state.required.length}`)} জমা
          </span>
        )}
      </div>
      <p className="text-xs leading-relaxed text-ink-soft">
        অনুমোদনের আগে অ্যাডমিন এই ছবিগুলো দেখে নেন — এখনই দিয়ে রাখলে অনুমোদন
        দ্রুত হয়। ছবি শুধু PROSANTI স্টাফ দেখতে পান।
      </p>

      {loadError && (
        <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-800 ring-1 ring-rose-200">
          {loadError}
        </p>
      )}
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-xl p-3 text-xs font-medium ring-1 ${
            message.tone === "error"
              ? "bg-rose-50 text-rose-800 ring-rose-200"
              : "bg-emerald-50 text-emerald-900 ring-emerald-200"
          }`}
        >
          {message.text}
        </p>
      )}

      <ul className="space-y-2">
        {KYC_DOCS.map((doc) => {
          const url = state?.kyc[doc.id];
          const isRequired = state ? required.has(doc.id) : doc.required === "always";
          const busy = busyDoc === doc.id;
          return (
            <li
              key={doc.id}
              className="flex items-center gap-3 rounded-2xl bg-ivory-50 p-3 ring-1 ring-line"
            >
              {url ? (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-lg ring-1 ring-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-800"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- Cloudinary thumbnail, rider-only, opened full-size on tap */}
                  <img src={thumb(url)} alt={`${doc.bn} — আপলোড করা ছবি`} width={64} height={48} className="h-12 w-16 rounded-lg object-cover" />
                </a>
              ) : (
                <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-lg bg-white text-ink-soft ring-1 ring-line">
                  <IconImage className="h-5 w-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-forest-900">
                  {doc.bn}
                  {url ? (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                      <IconCheck className="h-3 w-3" /> জমা
                    </span>
                  ) : isRequired ? (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">বাধ্যতামূলক</span>
                  ) : (
                    <span className="rounded-full bg-ivory-200 px-1.5 py-0.5 text-[10px] font-bold text-ink-soft">ঐচ্ছিক</span>
                  )}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">{doc.hintBn}</p>
              </div>
              <input
                ref={(el) => {
                  inputs.current[doc.id] = el;
                }}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                aria-label={`${doc.bn} — ছবি বেছে নিন`}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void upload(doc.id, file);
                }}
              />
              <button
                type="button"
                disabled={busy || busyDoc !== null}
                onClick={() => inputs.current[doc.id]?.click()}
                className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-forest-800 px-4 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-800 focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {busy ? "পাঠানো হচ্ছে…" : url ? "বদলান" : "ছবি দিন"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
