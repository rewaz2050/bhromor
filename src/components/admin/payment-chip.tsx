import type { Order } from "@/lib/orders";
import { paymentSummary, type PaymentTone } from "@/lib/payment-labels";

const TONE: Record<PaymentTone, string> = {
  neutral: "bg-ivory-100 text-ink-soft",
  pending: "bg-amber-100 text-amber-900",
  ok: "bg-emerald-100 text-emerald-900",
  rejected: "bg-rose-100 text-rose-800",
};

/** "COD" · "bKash · verify" · "Nagad ✓" — one chip for every ops list. */
export function PaymentChip({
  order,
  className = "",
}: {
  order: Pick<Order, "payment" | "paymentStatus" | "status">;
  className?: string;
}) {
  const pay = paymentSummary(order);
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[0.68rem] font-semibold uppercase tracking-wide ${TONE[pay.tone]} ${className}`}
      title={pay.label}
    >
      {pay.short}
    </span>
  );
}
