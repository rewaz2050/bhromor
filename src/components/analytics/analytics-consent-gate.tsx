"use client";

/**
 * Consent gate for Meta Pixel + GA4 (privacy report 2026-10-14, M3).
 *
 * Nothing third-party renders until the visitor picks. The banner appears
 * only when a tracker is actually configured and no choice is stored; the
 * choice itself is remembered in localStorage (no tracking cookie).
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AnalyticsScripts from "./analytics-scripts";
import { ga4Id, metaPixelId } from "@/lib/analytics";
import {
  readAnalyticsConsent,
  writeAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analytics-consent";

export default function AnalyticsConsentGate() {
  const [consent, setConsent] = useState<AnalyticsConsent | null>(null);
  const [ready, setReady] = useState(false);
  const pixel = metaPixelId();
  const ga = ga4Id();
  const configured = Boolean(pixel || ga);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable in the browser; reading it in a lazy useState initializer would render the stored choice on the client and null on the server, i.e. a hydration mismatch on every returning visit
    setConsent(readAnalyticsConsent());
    setReady(true);
  }, []);

  const pick = useCallback((value: AnalyticsConsent) => {
    writeAnalyticsConsent(value);
    setConsent(value);
  }, []);

  if (!configured) return null;

  const showBanner = ready && consent === null;

  return (
    <>
      {ready && consent === "accepted" ? <AnalyticsScripts /> : null}
      {showBanner ? (
        <div
          role="dialog"
          aria-label="Analytics consent"
          data-testid="analytics-consent-banner"
          className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-lg rounded-2xl border border-line bg-white/95 p-4 shadow-2xl backdrop-blur"
        >
          <p className="text-sm text-ink">
            আমরা দোকান উন্নত করতে{" "}
            <strong>Google Analytics ও Meta Pixel</strong> ব্যবহার করতে পারি
            (দেখা পেজ, সার্চ, অর্ডার)। এগুলো ছাড়াও সাইট চলবে।{" "}
            <span className="text-ink-soft">
              We may use Google Analytics and Meta Pixel to improve the shop.
              The site works fine without them.
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="analytics-consent-accept"
              onClick={() => pick("accepted")}
              className="rounded-full bg-forest-800 px-5 py-2 text-sm font-semibold text-ivory-50 hover:bg-forest-700"
            >
              মঞ্জুর করি / Accept
            </button>
            <button
              type="button"
              data-testid="analytics-consent-decline"
              onClick={() => pick("declined")}
              className="rounded-full border border-line px-5 py-2 text-sm font-semibold text-ink hover:bg-ink/5"
            >
              মঞ্জুর নই / Decline
            </button>
            {/* <Link>, not <a>: the banner sits on a storefront page, and a
                hard navigation away from it would throw away the banner and
                the visitor's half-made choice to reload one info page. */}
            <Link
              href="/privacy"
              className="rounded-full px-5 py-2 text-sm font-medium text-forest-700 underline-offset-2 hover:underline"
            >
              বিস্তারিত / Details
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
