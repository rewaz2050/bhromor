"use client";

/** A shop console that fails must stay recoverable in place (scan 2026-10-08). */

import { useEffect } from "react";
import ErrorState from "@/components/ui/error-state";

export default function VendorError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Vendor console failed to render", error);
  }, [error]);

  return (
    <ErrorState
      error={error}
      onRetry={reset}
      title="The shop console could not load"
      titleBn="দোকানের কনসোল লোড হয়নি"
      homeHref="/vendor"
      homeLabel="Back to my shop"
      homeLabelBn="আমার দোকানে ফিরুন"
    />
  );
}
