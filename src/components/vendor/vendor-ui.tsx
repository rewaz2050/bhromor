"use client";

/**
 * Shared vendor-dashboard UI atoms (marketplace slice 3).
 */

import Link from "next/link";
import type { OrderStatus } from "@/lib/orders";

const STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  "ready-for-pickup": "Ready for pickup",
  "courier-assigned": "Courier assigned",
  "out-for-delivery": "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

const STATUS_CLS: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-900 ring-amber-200",
  confirmed: "bg-sky-100 text-sky-900 ring-sky-200",
  preparing: "bg-violet-100 text-violet-900 ring-violet-200",
  "ready-for-pickup": "bg-teal-100 text-teal-900 ring-teal-200",
  "courier-assigned": "bg-indigo-100 text-indigo-900 ring-indigo-200",
  "out-for-delivery": "bg-blue-100 text-blue-900 ring-blue-200",
  delivered: "bg-forest-100 text-forest-900 ring-forest-200",
  cancelled: "bg-stone-200 text-stone-600 ring-stone-300",
};

export const StatusPill = ({ status }: { status: OrderStatus }) => (
  <span
    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${STATUS_CLS[status]}`}
  >
    {STATUS_LABEL[status]}
  </span>
);

export const PageHeader = ({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) => (
  <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
    <div>
      <h2 className="font-display text-xl font-medium text-forest-900">{title}</h2>
      {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
    </div>
    {action}
  </div>
);

export const EmptyState = ({
  title,
  sub,
  action,
}: {
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) => (
  <div className="rounded-2xl bg-paper px-6 py-12 text-center ring-1 ring-line">
    <p className="font-display text-lg text-forest-900">{title}</p>
    {sub && <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">{sub}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorBox = ({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) => (
  <div
    role="alert"
    className="rounded-2xl bg-rose-50 px-5 py-4 text-sm text-rose-900 ring-1 ring-rose-200"
  >
    <p className="font-medium">{message}</p>
    {onRetry && (
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 font-semibold underline underline-offset-2"
      >
        Try again
      </button>
    )}
  </div>
);

export const Skeleton = ({ lines = 3 }: { lines?: number }) => (
  <div className="space-y-3" aria-label="Loading">
    {Array.from({ length: lines }).map((_, i) => (
      <div key={i} className="h-16 animate-pulse rounded-2xl bg-line/60" />
    ))}
  </div>
);

export const PrimaryLink = ({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) => (
  <Link
    href={href}
    className="inline-flex items-center rounded-xl bg-forest-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-forest-900"
  >
    {children}
  </Link>
);

export const formatDateTime = (ts: number): string =>
  new Date(ts).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
