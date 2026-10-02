import { formatBdt } from "@/lib/format";
import { deliverySlotSummary } from "@/lib/delivery-slots";
import { cashToCollect, paymentSummary } from "@/lib/payment-labels";
import { customerNavHref, shopNavHref } from "@/lib/rider-maps";
import { secondsLeft, type RiderTask } from "@/lib/rider-tasks";
import TripStepper from "@/components/rider/trip-stepper";
import { IconCheck, IconMapPin, IconPhone } from "@/components/ui/icons";
import { FailedAttemptForm } from "./failed-attempt-form";

/**
 * One offer or trip on the board. Offered → accept/decline with a live
 * countdown; accepted → confirm pickup; picked up → enter the customer's
 * delivery code (or report a failed attempt). Pure presentation: every action
 * is a callback owned by the page.
 */
export function TaskCard({
  task,
  now,
  isOnline,
  cashLimitReached,
  accepting,
  onAccept,
  onReject,
  onPickup,
  onEnterCode,
  onFailedRecorded,
}: {
  task: RiderTask;
  /** Epoch ms from `useNow`. */
  now: number;
  isOnline: boolean;
  cashLimitReached: boolean;
  /** Id of the task whose accept call is in flight, if any. */
  accepting: string | null;
  onAccept: (task: RiderTask) => void;
  onReject: (task: RiderTask) => void;
  onPickup: (task: RiderTask) => void;
  onEnterCode: (task: RiderTask) => void;
  onFailedRecorded: (message: string) => void;
}) {
  const isOut = task.state === "picked_up";
  const isReady =
    task.state === "accepted" || task.state === "offered";
  const order = task.order;
  const cash = cashToCollect(order);
  const pay = paymentSummary(order);
  const maps = task.state === "offered" ? null : customerNavHref(order);
  const left = task.state === "offered" ? secondsLeft(task.expiresAt, now) : null;

  return (
    <div
      className="rounded-2xl border border-line bg-paper p-5 shadow-sm space-y-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <span className="font-mono text-xs font-bold text-forest-900">
            #{order.id}
          </span>
          <p className="text-xs text-ink-soft mt-0.5">
            {order.items.length} টি আইটেম • {order.zoneName}
          </p>
        </div>

        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
            isOut
              ? "bg-amber-100 text-amber-900"
              : "bg-forest-100 text-forest-800"
          }`}
        >
          {isOut ? "পথে আছেন" : task.state === "offered" ? "নতুন অফার" : "পিকআপ রেডি"}
        </span>
      </div>

      <TripStepper state={task.state} />

      {left !== null && (
        <div
          className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold ${
            left <= 20 ? "bg-rose-50 text-rose-800 ring-1 ring-rose-200" : "bg-gold-100 text-forest-900 ring-1 ring-gold-300"
          }`}
          data-testid="rider-offer-countdown"
          aria-live="polite"
        >
          <span>⏳ একসেপ্ট করার সময় বাকি</span>
          <span className="font-mono text-sm tabular-nums">
            {left > 0 ? `${left} সেকেন্ড` : "সময় শেষ — রিফ্রেশ হচ্ছে…"}
          </span>
        </div>
      )}

      {task.state === "offered" && (
        <p className="rounded-xl bg-sky-50 p-3 text-xs text-sky-900">
          এলাকার রাইডারদের অনুরোধ—যিনি আগে গ্রহণ করবেন, তিনিই ডেলিভারি পাবেন। গ্রহণের পর কাস্টমারের যোগাযোগের তথ্য দেখাবে।
        </p>
      )}

      {task.pickupShop && (
        <div className="rounded-xl border border-line p-3 text-xs space-y-2">
          <p className="font-semibold text-forest-900">{order.isReturn ? "দোকানে ফেরত দিন" : "পিকআপের দোকান"}: {task.pickupShop.name}</p>
          <p className="text-ink-soft">{task.pickupShop.address || "দোকানে কল করে পিকআপ ঠিকানা নিশ্চিত করুন"}</p>
          <div className="flex flex-wrap gap-3">
            {task.pickupShop.phone && <a className="underline min-h-11 inline-flex items-center" href={`tel:${task.pickupShop.phone}`}>দোকানে কল</a>}
            {shopNavHref(task.pickupShop) && <a className="underline min-h-11 inline-flex items-center" target="_blank" rel="noopener noreferrer" data-testid="rider-shop-nav" href={shopNavHref(task.pickupShop) ?? undefined}>দোকানে নেভিগেট</a>}
          </div>
        </div>
      )}

      {/* Customer & Area details */}
      <div className="rounded-xl bg-ivory-100/60 p-3 space-y-2 text-xs">
        <div className="flex items-start gap-2">
          <IconMapPin className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
          <div>
            <p className="font-semibold text-forest-900">
              {order.customer.name}
            </p>
            <p className="text-ink-soft">
              {order.customer.area}
              {order.customer.address ? `, ${order.customer.address}` : ""}
            </p>
          </div>
        </div>

        {order.customer.note && (
          <p className="rounded-lg bg-paper px-2 py-1.5 text-[11px] italic text-ink ring-1 ring-line/60" data-testid="rider-note">
            📝 কাস্টমারের নোট: “{order.customer.note}”
          </p>
        )}

        {cash > 0 ? (
          <div className="flex items-center justify-between border-t border-line/60 pt-2 font-medium" data-testid="rider-cash">
            <span className="text-ink-soft">💵 ক্যাশ সংগ্রহ করতে হবে (COD):</span>
            <strong className="text-forest-900 font-bold text-sm">
              {formatBdt(cash)}
            </strong>
          </div>
        ) : (
          <div className="flex items-center justify-between border-t border-line/60 pt-2 font-medium" data-testid="rider-cash">
            <span className="text-emerald-800">
              ✅ {order.isReturn
                ? "রিটার্ন — কোনো টাকা নিবেন না"
                : `${pay.wallet ?? "অনলাইনে"}-এ পেমেন্ট হয়ে গেছে — কোনো টাকা নিবেন না`}
            </span>
            <strong className="text-sm font-bold text-emerald-800">৳০</strong>
          </div>
        )}
        {(order.tipAmount ?? 0) > 0 && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-forest-700">💝 Tip for you</span>
            <span className="font-bold text-forest-700">+{formatBdt(order.tipAmount ?? 0)}</span>
          </div>
        )}
        {order.isPickup && <p className="text-[11px] font-bold text-sky-800 bg-sky-50 px-2 py-1 rounded-full">🏪 Pickup at Traffic Point — no home delivery</p>}
        {order.isReturn && (
          <p className="text-[11px] font-bold text-amber-900 bg-amber-50 px-2 py-1 rounded-full">
            ↩️ Return pickup — collect from the customer, drop at the shop. No cash to collect.
          </p>
        )}
        {deliverySlotSummary(order, "bn") && (
          <p className="w-fit rounded-full bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-800" data-testid="rider-slot">
            🕒 ডেলিভারি সময়: {deliverySlotSummary(order, "bn")}
          </p>
        )}
      </div>

      {/* Action Controls */}
      <div className="flex flex-col gap-2 pt-1">
        <div className="flex items-center gap-2">
          {task.state !== "offered" && order.customer.phone && <a
            href={`tel:${order.customer.phone}`}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-paper text-xs font-semibold text-forest-900 hover:bg-ivory-100"
          >
            <IconPhone className="h-4 w-4 text-forest-700" /> কল দিন
          </a>}
          {maps && !order.isPickup && (
            <a
              href={maps}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-paper text-xs font-semibold text-forest-900 hover:bg-ivory-100"
              data-testid="rider-maps"
            >
              <IconMapPin className="h-4 w-4 text-emerald-700" /> নেভিগেট
            </a>
          )}

        {task.state === "offered" ? (
          <>
            <button
              type="button"
              onClick={() => onReject(task)}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-paper text-xs font-semibold text-rose-700 hover:bg-rose-50"
            >
              বাতিল
            </button>
            <button
              type="button"
              onClick={() => onAccept(task)}
              disabled={!isOnline || left === 0 || cashLimitReached || accepting !== null}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gold-600 text-xs font-semibold text-forest-950 hover:bg-gold-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {accepting === task.id ? "গ্রহণ হচ্ছে…" : "অর্ডার একসেপ্ট করুন"}
            </button>
          </>
        ) : isReady ? (
          <button
            type="button"
            onClick={() => onPickup(task)}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-forest-800 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
          >
            পিকআপ কনফার্ম করুন
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onEnterCode(task)}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 text-xs font-semibold text-ivory-50 hover:bg-emerald-800"
          >
            <IconCheck className="h-4 w-4" /> ডেলিভারি কোড দিন
          </button>
        )}
        </div>
        {isOut && (
          <FailedAttemptForm assignmentId={task.id} onRecorded={onFailedRecorded} />
        )}
      </div>
    </div>
  );
}
