"use client";

/**
 * B5 (2026-09-28) — the shop's view of its own badge.
 *
 * The badge is staff's to give, so this card is READ-ONLY — and that is the
 * point: it tells the shop exactly what is missing instead of leaving it to
 * guess why a competitor has a tick and it does not. No "apply for
 * verification" button that goes nowhere: staff hold the paperwork, and the
 * card says who to send it to.
 *
 * Presentational + plain props: the wording is testable without a network.
 */

import {
  CHECK_LABEL,
  checkPhraseList,
  isVerified,
  missingChecks,
  vendorVerificationLine,
  verifiedOnLabel,
} from "@/lib/shop-verification";
import type { ShopVerification } from "@/lib/catalog";

export default function VerificationCard({
  verification,
  shopName,
}: {
  verification?: ShopVerification | null;
  shopName: string;
}) {
  const verified = isVerified(verification);
  const missing = missingChecks(verification);
  return (
    <section
      aria-label="Verified shop badge"
      className="rounded-2xl bg-paper p-5 ring-1 ring-line"
      data-testid="verification-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          Verified shop badge
        </h3>
        <span
          data-testid="verification-state"
          className={`rounded-full px-3 py-1 text-[0.62rem] font-bold uppercase tracking-wide ${
            verified ? "bg-forest-100 text-forest-900" : "bg-ivory-200 text-ink-soft"
          }`}
        >
          {verified ? "Verified" : "Not yet verified"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-ink" data-testid="verification-line">
        {vendorVerificationLine(verification)}
      </p>

      <ul className="mt-3 space-y-1.5" data-testid="verification-checks">
        {(["nid", "tradeLicence"] as const).map((key) => {
          const done = key === "nid" ? verification?.nid === true : verification?.tradeLicence === true;
          return (
            <li
              key={key}
              data-testid={`verification-check-${key}`}
              className="flex items-center gap-2 text-sm"
            >
              <span
                aria-hidden="true"
                className={`grid h-5 w-5 place-items-center rounded-full text-[0.62rem] font-bold ${
                  done ? "bg-forest-100 text-forest-900" : "bg-ivory-200 text-ink-soft"
                }`}
              >
                {done ? "✓" : "·"}
              </span>
              <span className={done ? "text-ink" : "text-ink-soft"}>{CHECK_LABEL[key]}</span>
              <span className="text-xs text-ink-soft">
                {done ? "checked" : "not checked yet"}
              </span>
            </li>
          );
        })}
      </ul>

      {verified && verification?.verifiedAt ? (
        <p className="mt-3 text-[0.68rem] text-ink-soft" data-testid="verification-since">
          {verifiedOnLabel(verification.verifiedAt)} · shoppers see “ID and trade licence
          checked by PROSANTI” on {shopName}.
        </p>
      ) : (
        missing.length > 0 && (
          <p className="mt-3 text-[0.68rem] leading-5 text-ink-soft" data-testid="verification-help">
            Send the {checkPhraseList(missing)} to PROSANTI and staff will tick it — the badge
            appears on its own, and disappears if a document expires.
          </p>
        )
      )}
    </section>
  );
}
