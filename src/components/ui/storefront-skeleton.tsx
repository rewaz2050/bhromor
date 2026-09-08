export default function StorefrontSkeleton({
  product = false,
}: {
  product?: boolean;
}) {
  return (
    <div
      role="status"
      aria-label={product ? "Loading product" : "Loading collection"}
      className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"
    >
      <span className="sr-only">
        {product ? "Loading product details…" : "Loading the collection…"}
      </span>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="mb-8 h-3 w-40 bg-ivory-200" />
        {product ? (
          <div className="grid gap-10 lg:grid-cols-2">
            <div className="aspect-[4/5] bg-ivory-200" />
            <div className="space-y-6">
              <div className="h-12 w-4/5 bg-ivory-200" />
              <div className="h-5 w-28 bg-ivory-200" />
              <div className="h-8 w-40 bg-ivory-200" />
              <div className="h-24 bg-ivory-100" />
              <div className="flex gap-3">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="h-11 w-11 bg-ivory-200" />
                ))}
              </div>
              <div className="h-14 bg-ivory-200" />
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5 h-12 w-3/4 max-w-lg bg-ivory-200" />
            <div className="mb-12 h-5 w-1/2 bg-ivory-100" />
            <div className="grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <div key={i}>
                  <div className="aspect-[3/4] bg-ivory-200" />
                  <div className="mt-4 h-3 w-1/3 bg-ivory-200" />
                  <div className="mt-3 h-5 w-4/5 bg-ivory-200" />
                  <div className="mt-3 h-4 w-1/2 bg-ivory-200" />
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
