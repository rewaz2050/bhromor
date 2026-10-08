import StorefrontSkeleton from "@/components/ui/storefront-skeleton";

/**
 * The offers page always exists, so streaming it is safe — a page that can
 * never 404 has no status to lose. See `(home)/loading.tsx` for why the
 * storefront no longer carries one group-wide fallback.
 */
export default function Loading() {
  return <StorefrontSkeleton />;
}
