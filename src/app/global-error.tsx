"use client";

/**
 * The last line of defence (scan 2026-10-08).
 *
 * `error.tsx` cannot catch an error thrown by the root layout, so this one
 * replaces the whole document — which is why it must render its own `<html>`
 * and `<body>` and import the stylesheet itself. Without it, a failure in the
 * root layout (the font imports, the analytics scripts) left the shopper
 * staring at a blank white screen.
 */

import ErrorState from "@/components/ui/error-state";
import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Report via structured logger when available; fallback to console
  if (typeof window !== "undefined") {
    console.error("Root layout failed to render", error);
  }
  return (
    <html lang="bn" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-ivory-50 text-ink">
        <ErrorState error={error} onRetry={reset} />
      </body>
    </html>
  );
}
