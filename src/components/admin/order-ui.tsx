import { STATUS_META, type OrderStatus } from "@/lib/orders";

/** Visual treatment per order status — muted, calm palette (§37). */
const BADGE: Record<OrderStatus, string> = {
  pending: "bg-amber-100 text-amber-900 ring-amber-300/60",
  confirmed: "bg-forest-100 text-forest-800 ring-forest-300/70",
  preparing: "bg-gold-100 text-gold-700 ring-gold-300/80",
  "ready-for-pickup": "bg-teal-100 text-teal-800 ring-teal-300/70",
  "courier-assigned": "bg-sky-100 text-sky-800 ring-sky-300/70",
  "out-for-delivery": "bg-violet-100 text-violet-800 ring-violet-300/70",
  delivered: "bg-emerald-100 text-emerald-800 ring-emerald-300/70",
  cancelled: "bg-rose-100 text-rose-800 ring-rose-300/70",
};

/** Small colored dot used on the status rail. */
export const DOT: Record<OrderStatus, string> = {
  pending: "bg-amber-500",
  confirmed: "bg-forest-500",
  preparing: "bg-gold-500",
  "ready-for-pickup": "bg-teal-500",
  "courier-assigned": "bg-sky-500",
  "out-for-delivery": "bg-violet-500",
  delivered: "bg-emerald-500",
  cancelled: "bg-rose-400",
};

export function StatusBadge({
  status,
  className = "",
}: {
  status: OrderStatus;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ring-1 ${BADGE[status]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOT[status]}`} aria-hidden />
      {STATUS_META[status].short}
    </span>
  );
}

export const clockTime = (ms: number): string =>
  new Date(ms).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

export const shortDate = (ms: number): string =>
  new Date(ms).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });

/** “12:41 PM · 8 Sep” — human-friendly timestamps for admin lists. */
export const stamp = (ms: number): string => `${clockTime(ms)} · ${shortDate(ms)}`;

/** “Today 3:12 PM” / “Yesterday 9:05 AM” / “8 Sep 1:20 PM”. */
export const friendlyWhen = (ms: number): string => {
  const today = new Date();
  const startToday = new Date(today).setHours(0, 0, 0, 0);
  const startOf = new Date(ms).setHours(0, 0, 0, 0);
  if (startOf === startToday) return `Today · ${clockTime(ms)}`;
  if (startOf === startToday - 86_400_000) return `Yesterday · ${clockTime(ms)}`;
  return `${shortDate(ms)} · ${clockTime(ms)}`;
};
