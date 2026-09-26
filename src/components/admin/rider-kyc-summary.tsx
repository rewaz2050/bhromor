"use client";

/**
 * Round 4 (2026-09-26) — the KYC documents a rider uploaded, on the
 * Admin → Riders card. Staff open each photo full-size in a new tab before
 * pressing Approve; missing required documents are listed so the phone
 * call to the applicant can be specific.
 */

import { KYC_DOCS, kycProgress, type RiderKyc } from "@/lib/rider-kyc";

/** Small Cloudinary thumbnail (server-side crop) for a full delivery URL. */
export const kycThumbUrl = (url: string): string =>
  url.replace("/image/upload/", "/image/upload/c_fill,w_240,h_180,q_auto,f_auto/");

export function RiderKycSummary({
  kyc,
  vehicle,
  submittedAt,
}: {
  kyc?: RiderKyc;
  vehicle: string;
  submittedAt?: number;
}) {
  const progress = kycProgress(kyc, vehicle);
  const uploaded = KYC_DOCS.filter((d) => kyc && typeof kyc[d.id] === "string");
  const complete = progress.complete;

  return (
    <section
      aria-label="KYC documents"
      className={`mt-3 rounded-2xl p-3 ring-1 ${complete ? "bg-emerald-50 ring-emerald-200" : "bg-amber-50 ring-amber-200"}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs font-semibold text-forest-900">
          KYC {progress.done.length}/{progress.required.length}
          {complete ? " — complete" : " — incomplete"}
        </p>
        {submittedAt && (
          <span className="text-[11px] text-ink-soft">
            submitted {new Date(submittedAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
          </span>
        )}
      </div>
      {uploaded.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {uploaded.map((d) => {
            const url = kyc?.[d.id] as string;
            return (
              <li key={d.id}>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-xl bg-white p-1 ring-1 ring-line transition-colors hover:ring-forest-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-800"
                >
                  {/* Cloudinary-hosted, staff-only, opened full-size on click — plain img keeps it out of next/image's remote allow-list. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={kycThumbUrl(url)}
                    alt={`${d.en} — open full size`}
                    width={120}
                    height={90}
                    loading="lazy"
                    className="h-[90px] w-[120px] rounded-lg object-cover"
                  />
                  <span className="mt-1 block text-center text-[11px] font-semibold text-forest-900">{d.en}</span>
                </a>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-ink-soft">
          Nothing uploaded yet — the rider adds NID / selfie photos from the “pending” card on /rider/login.
        </p>
      )}
      {!complete && (
        <p className="mt-2 text-[11px] text-amber-900">
          Missing:{" "}
          {progress.missing
            .map((id) => KYC_DOCS.find((d) => d.id === id)?.en ?? id)
            .join(", ")}
          .
        </p>
      )}
    </section>
  );
}
