"use client";

/**
 * Placeholder painted while the stored bag waits for the live catalog to
 * answer (audit 2026-09-18, P0 #7). Opening /cart or /checkout directly used
 * to flash "Your cart is empty" for a beat — the lines were in localStorage,
 * the product rows were still in flight. This is what shows instead.
 */
export default function BagSkeleton({
  lines = 2,
  label = "ব্যাগ লোড হচ্ছে…",
}: {
  lines?: number;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="bag-skeleton"
      className="animate-pulse"
    >
      <span className="sr-only">{label}</span>
      <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {Array.from({ length: lines }).map((_, i) => (
            <div key={i} className="flex gap-5 py-2">
              <div className="aspect-[4/5] w-24 shrink-0 rounded-xl bg-ivory-100 ring-1 ring-line sm:w-28" />
              <div className="flex-1 space-y-3 pt-1">
                <div className="h-3 w-24 rounded bg-ivory-100" />
                <div className="h-5 w-3/4 rounded bg-ivory-100" />
                <div className="h-3 w-1/2 rounded bg-ivory-100" />
                <div className="mt-6 h-10 w-32 rounded-full bg-ivory-100" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden lg:block">
          <div className="rounded-3xl bg-paper p-8 ring-1 ring-line">
            <div className="h-6 w-40 rounded bg-ivory-100" />
            <div className="mt-6 space-y-3">
              <div className="h-4 w-full rounded bg-ivory-100" />
              <div className="h-4 w-5/6 rounded bg-ivory-100" />
              <div className="h-4 w-2/3 rounded bg-ivory-100" />
            </div>
            <div className="mt-8 h-12 w-full rounded-full bg-ivory-100" />
          </div>
        </div>
      </div>
    </div>
  );
}
