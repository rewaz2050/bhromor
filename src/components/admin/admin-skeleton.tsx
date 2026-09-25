/**
 * Admin dashboard skeleton — shown while the orders feed is loading so the
 * KPI cards don't flash zeros before the first snapshot arrives.
 */
export default function AdminDashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard" className="space-y-8">
      <span className="sr-only">Loading the dashboard…</span>
      <div aria-hidden="true" className="motion-safe:animate-pulse">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="rounded-2xl bg-paper p-5 ring-1 ring-line">
              <div className="h-3 w-24 bg-ivory-200" />
              <div className="mt-4 h-8 w-20 bg-ivory-200" />
              <div className="mt-3 h-3 w-32 bg-ivory-100" />
            </div>
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="rounded-2xl bg-paper p-6 ring-1 ring-line lg:col-span-3">
            <div className="h-4 w-40 bg-ivory-200" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="h-10 bg-ivory-100" />
              ))}
            </div>
          </div>
          <div className="rounded-2xl bg-paper p-6 ring-1 ring-line lg:col-span-2">
            <div className="h-4 w-28 bg-ivory-200" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="h-8 bg-ivory-100" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
