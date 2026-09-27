import { notFound } from "next/navigation";

/**
 * UX plan §1.4 (R8) — every URL no other route claims lands on the
 * storefront's own 404 (`../not-found.tsx`, inside the site chrome with
 * the shelf) instead of the bare root one. Real routes always win over a
 * catch-all, so nothing else changes.
 */
export default function MissingPage() {
  notFound();
}
