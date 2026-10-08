"use client";

/**
 * The app-wide error boundary (scan 2026-10-08).
 *
 * Every surface except `/admin` used to have none, so a thrown server error —
 * a dropped connection, a row the mappers did not expect — replaced the whole
 * page with Next's bare "Application error" screen: no header, no footer, no
 * way back. `/admin` keeps its own (it offers "sign in again"); the rider and
 * vendor apps get their own so they keep their chrome.
 *
 * This catches errors in pages and in nested layouts. It does NOT catch an
 * error thrown by the root layout itself — `global-error.tsx` does that.
 */

import { useEffect } from "react";
import ErrorState from "@/components/ui/error-state";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page failed to render", error);
  }, [error]);

  return <ErrorState error={error} onRetry={reset} />;
}
