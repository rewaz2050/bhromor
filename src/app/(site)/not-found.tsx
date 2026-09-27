import NotFoundView from "@/components/info/not-found-view";

/**
 * Storefront 404 (UX plan §1.4, R8): rendered inside the site layout —
 * header, language, bag — with the best-seller shelf underneath. Reached
 * by `notFound()` from any (site) route and, via the `[...missing]`
 * catch-all, by every URL nothing else claims.
 */
export default function SiteNotFound() {
  return <NotFoundView />;
}
