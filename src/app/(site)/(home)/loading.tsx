import StorefrontSkeleton from "@/components/ui/storefront-skeleton";

/**
 * The homepage's instant skeleton — scoped to this route group on purpose.
 *
 * It used to live at `(site)/loading.tsx`, which put a Suspense boundary
 * around EVERY storefront route. A streamed response cannot change its status
 * after the first flush, so every `notFound()` under that boundary answered
 * HTTP 200 with the 404 page — a soft 404 on the whole site (scan
 * 2026-10-08). Routes that can refuse (a piece or a shop that is not there)
 * must not carry a boundary above them; routes that always exist — the
 * homepage and the listings — keep theirs.
 */
export default function Loading() {
  return <StorefrontSkeleton />;
}
