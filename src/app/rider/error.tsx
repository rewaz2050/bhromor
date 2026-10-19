"use client";

/**
 * A rider board that fails mid-shift must not dump the rider on a bare screen
 * with no way back to their jobs (scan 2026-10-08).
 */

import { useEffect } from "react";
import ErrorState from "@/components/ui/error-state";
import { logError } from "@/lib/logger";

export default function RiderError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("Rider board failed to render", error, { route: "/rider", code: error.digest });
  }, [error]);

  return (
    <ErrorState
      error={error}
      onRetry={reset}
      title="The rider board could not load"
      titleBn="রাইডার বোর্ড লোড হয়নি"
      homeHref="/rider"
      homeLabel="Back to my jobs"
      homeLabelBn="আমার কাজে ফিরুন"
    />
  );
}
