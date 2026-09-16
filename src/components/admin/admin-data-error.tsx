"use client";

/**
 * One honest error strip for admin pages that read live data.
 *
 * The admin data hooks (useOrders / useSettings / useCatalog / useGrowth…)
 * keep the last API failure in `error`, but several pages never rendered
 * it — a failed load looked like "no orders" / default settings, and a
 * failed save looked like success. Render this right under the page title
 * with the hook's `error`, `clearError` and `reset`.
 */
export default function AdminDataError({
  error,
  onRetry,
  onDismiss,
  label,
}: {
  error: string | null | undefined;
  /** Re-run the hook's fetch (its `reset`/`refresh`). */
  onRetry?: () => void | Promise<unknown>;
  onDismiss?: () => void;
  /** What failed, e.g. "Orders" — prefixes the message. */
  label?: string;
}) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800 ring-1 ring-rose-200"
    >
      <span className="min-w-0 flex-1">
        {label ? <span className="font-semibold">{label}: </span> : null}
        {error}
      </span>
      {onRetry ? (
        <button
          type="button"
          onClick={() => void onRetry()}
          className="rounded-full bg-rose-700 px-3 py-1 text-xs font-semibold text-white hover:bg-rose-800"
        >
          Retry
        </button>
      ) : null}
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs underline underline-offset-2"
        >
          Dismiss
        </button>
      ) : null}
    </p>
  );
}
