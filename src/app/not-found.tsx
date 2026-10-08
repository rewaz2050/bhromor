import type { Metadata } from "next";
import { ButtonLink } from "@/components/ui/primitives";

/**
 * Without this the 404 page carried the homepage's <title>, so a broken link
 * was labelled "PROSANTI — Rooted in Bangladesh…" in the tab, in the history
 * and in a share sheet (scan 2026-10-08).
 */
export const metadata: Metadata = {
  title: "Page not found",
  description: "This page does not exist or has moved.",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="flex flex-col items-center px-6 py-28 text-center">
      <p className="font-display text-7xl font-medium text-forest-200">404</p>
      <h1 className="font-display mt-6 text-3xl font-medium text-forest-900">
        Lost in the wardrobe?
      </h1>
      <p className="mt-3 max-w-sm text-ink-soft">
        The page you are looking for does not exist or has moved. Let us take
        you somewhere useful.
      </p>
      <div className="mt-8">
        <ButtonLink href="/shop" size="lg">
          Back to Collection
        </ButtonLink>
      </div>
    </div>
  );
}
