import type { Metadata } from "next";
import NotFoundView from "@/components/info/not-found-view";

/** See `app/not-found.tsx` — a 404 must not borrow the homepage's title. */
export const metadata: Metadata = {
  title: "Page not found",
  description: "This page does not exist or has moved.",
  robots: { index: false, follow: false },
};

/**
 * Storefront 404 (UX plan §1.4, R8): rendered inside the site layout —
 * header, language, bag — with the best-seller shelf underneath. Reached
 * by `notFound()` from any (site) route and, via the `[...missing]`
 * catch-all, by every URL nothing else claims.
 */
export default function SiteNotFound() {
  return <NotFoundView />;
}
