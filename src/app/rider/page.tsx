"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/use-orders";
import { useRiders } from "@/lib/use-riders";
import { formatBdt } from "@/lib/format";
import { getDeliveryCode } from "@/lib/orders";
import {
  IconBox,
  IconCheck,
  IconMapPin,
  IconPhone,
  IconShield,
  IconTruck,
} from "@/components/ui/icons";

export default function RiderPage() {
  const { orders, advance } = useOrders();
  const { riders, saveRider } = useRiders();

  // Active rider (defaulting to the first active rider or demo rider)
  const activeRider = useMemo(() => {
    return (
      riders.find((r) => r.status === "active") ??
      riders[0] ?? {
        id: "rider-default",
        name: "তানভীর আহমেদ (Tanvir)",
        phone: "01811111111",
        vehicle: "bike",
        zoneIds: [],
        status: "active",
        isOnline: true,
        cashInHand: 156000, // ৳1560
        ratingAvg: 4.9,
        ratingCount: 18,
      }
    );
  }, [riders]);

  const [isOnline, setIsOnline] = useState(activeRider.isOnline);
  const [selectedPinOrder, setSelectedPinOrder] = useState<string | null>(null);
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  // Cash limit: ৳5,000 (500,000 paisa)
  const CASH_LIMIT_PAISA = 500000;
  const isCashLimitReached = activeRider.cashInHand >= CASH_LIMIT_PAISA;

  // Active orders assigned or ready for dispatch
  const activeJobs = useMemo(() => {
    return orders.filter(
      (o) =>
        o.status === "ready-for-pickup" ||
        o.status === "courier-assigned" ||
        o.status === "out-for-delivery",
    );
  }, [orders]);

  const deliveredJobs = useMemo(() => {
    return orders.filter((o) => o.status === "delivered");
  }, [orders]);

  const toggleOnline = () => {
    const nextState = !isOnline;
    setIsOnline(nextState);
    void saveRider({
      ...activeRider,
      isOnline: nextState,
    });
  };

  const handlePickup = async (orderId: string) => {
    const ok = await advance(orderId, "out-for-delivery", "রাইডার পার্সেল সংগ্রহ করেছেন");
    if (ok) {
      setFlash(`অর্ডার #${orderId} পিকআপ সম্পন্ন! এখন কাস্টমারের পথে রওনা দিন।`);
      setTimeout(() => setFlash(null), 3000);
    }
  };

  const handleVerifyPin = async (orderId: string) => {
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;

    const expectedCode = getDeliveryCode(order.id);
    if (enteredPin.trim() !== expectedCode) {
      setPinError(`ভুল কোড! সঠিক ৪-সংখ্যার কোডটি কাস্টমারের কাছ থেকে নিন।`);
      return;
    }

    const ok = await advance(orderId, "delivered", "সফল ডেলিভারি সম্পন্ন ও ক্যাশ গ্রহণ");
    if (ok) {
      // Add COD total to rider's cash in hand
      void saveRider({
        ...activeRider,
        cashInHand: activeRider.cashInHand + order.total,
      });

      setSelectedPinOrder(null);
      setEnteredPin("");
      setPinError("");
      setFlash(`🎉 অভিনন্দন! অর্ডার #${order.id} সফলভাবে ডেলিভারি সম্পন্ন হয়েছে।`);
      setTimeout(() => setFlash(null), 4000);
    }
  };

  const handleSettleCash = () => {
    if (
      window.confirm(
        `আপনি কি অফিসে/bKash-এ ${formatBdt(activeRider.cashInHand)} টাকা জমা দিয়ে ক্যাশ সেটেল করতে চান?`,
      )
    ) {
      void saveRider({
        ...activeRider,
        cashInHand: 0,
      });
      setFlash("ক্যাশ সেটেলমেন্ট সম্পন্ন হয়েছে! নতুন ট্রিপ একসেপ্ট করতে পারবেন।");
      setTimeout(() => setFlash(null), 3000);
    }
  };

  return (
    <div className="flex-1 flex flex-col pb-12">
      {/* Top Mobile App Bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-forest-900 px-5 py-4 text-ivory-50 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-forest-800 text-gold-300 ring-1 ring-gold-400/40">
            <IconTruck className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-base font-semibold">PROSANTI রাইডার</h1>
            <p className="text-[11px] text-ivory-100/70">{activeRider.name}</p>
          </div>
        </div>

        {/* Online/Offline thumb toggle */}
        <button
          type="button"
          onClick={toggleOnline}
          className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
            isOnline
              ? "bg-emerald-500 text-forest-950 shadow-sm ring-2 ring-emerald-300"
              : "bg-forest-800 text-ivory-100/60 ring-1 ring-line"
          }`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isOnline ? "bg-forest-950 animate-pulse" : "bg-gray-400"
            }`}
          />
          {isOnline ? "অনলাইন" : "অফলাইন"}
        </button>
      </header>

      {/* Main Content Area */}
      <div className="p-4 sm:p-5 space-y-5">
        {/* Flash Message Banner */}
        {flash && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-2xl bg-emerald-50 p-4 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-300 animate-fade-in"
          >
            <IconCheck className="h-4 w-4 shrink-0 text-emerald-600" />
            <span>{flash}</span>
          </div>
        )}

        {/* Cash-in-hand safety meter card (§Zero-Pera Model) */}
        <section
          aria-label="Cash in hand"
          className="rounded-2xl border border-line bg-ivory-100/70 p-4 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <IconShield className="h-4 w-4 text-gold-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-forest-900">
                হাতে জমা ক্যাশ (COD)
              </span>
            </div>
            <span className="text-xs font-medium text-ink-soft">
              সীমা: ৳৫,০০০
            </span>
          </div>

          <div className="mt-3 flex items-baseline justify-between">
            <p className="font-display text-2xl font-bold text-forest-900">
              {formatBdt(activeRider.cashInHand)}
            </p>
            {activeRider.cashInHand > 0 && (
              <button
                type="button"
                onClick={handleSettleCash}
                className="rounded-full bg-forest-800 px-3 py-1 text-[11px] font-semibold text-ivory-50 hover:bg-forest-900"
              >
                টাকা জমা দিন (Settle)
              </button>
            )}
          </div>

          {/* Progress bar toward ৳5,000 cap */}
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ivory-200 ring-1 ring-line/40">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                isCashLimitReached
                  ? "bg-rose-600"
                  : activeRider.cashInHand > 300000
                  ? "bg-amber-500"
                  : "bg-emerald-600"
              }`}
              style={{
                width: `${Math.min(100, Math.round((activeRider.cashInHand / CASH_LIMIT_PAISA) * 100))}%`,
              }}
            />
          </div>

          {isCashLimitReached && (
            <p className="mt-2 text-xs font-semibold text-rose-700">
              ⚠️ ক্যাশ লিমিট পূর্ণ হয়েছে! নতুন অর্ডার পেতে অফিসে বা bKash-এ টাকা জমা দিন।
            </p>
          )}
        </section>

        {/* Quick Stats Strip */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-line bg-paper p-3.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              চলমান ডেলিভারি
            </p>
            <p className="font-display mt-1 text-2xl font-bold text-forest-900">
              {activeJobs.length}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-paper p-3.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              মোট সম্পন্ন
            </p>
            <p className="font-display mt-1 text-2xl font-bold text-emerald-700">
              {deliveredJobs.length}
            </p>
          </div>
        </div>

        {/* Active Jobs Section */}
        <section aria-label="Active tasks">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-semibold text-forest-900">
              অ্যাসাইন্ড অর্ডার সমূহ ({activeJobs.length})
            </h2>
            <span className="text-xs text-ink-soft">৪৫-৬০ মিনিট ডেলিভারি</span>
          </div>

          {!isOnline ? (
            <div className="rounded-2xl border border-dashed border-line bg-ivory-100/50 p-8 text-center">
              <p className="text-sm font-semibold text-ink-soft">
                আপনি অফলাইনে আছেন
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                নতুন ডেলিভারি টাস্ক পেতে উপরে &apos;অনলাইন&apos; বাটনটি চালু করুন।
              </p>
            </div>
          ) : activeJobs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-ivory-100/50 p-8 text-center">
              <IconBox className="mx-auto h-8 w-8 text-ink-soft/60" />
              <p className="mt-2 text-sm font-semibold text-forest-900">
                বর্তমানে কোনো সক্রিয় ট্রিপ নেই
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                দোকানদার পার্সেল রেডি করলেই এখানে নোটিফিকেশন আসবে।
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {activeJobs.map((order) => {
                const isOut = order.status === "out-for-delivery";
                const isReady =
                  order.status === "ready-for-pickup" ||
                  order.status === "courier-assigned";

                return (
                  <div
                    key={order.id}
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
                        {isOut ? "পথে আছেন" : "পিকআপ রেডি"}
                      </span>
                    </div>

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

                      <div className="flex items-center justify-between border-t border-line/60 pt-2 font-medium">
                        <span className="text-ink-soft">ক্যাশ সংগ্রহ করতে হবে:</span>
                        <strong className="text-forest-900 font-bold text-sm">
                          {formatBdt(order.total)}
                        </strong>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-2 pt-1">
                      <a
                        href={`tel:${order.customer.phone}`}
                        className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-paper text-xs font-semibold text-forest-900 hover:bg-ivory-100"
                      >
                        <IconPhone className="h-4 w-4 text-forest-700" /> কল দিন
                      </a>

                      {isReady ? (
                        <button
                          type="button"
                          onClick={() => handlePickup(order.id)}
                          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-forest-800 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
                        >
                          পিকআপ কনফার্ম করুন
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPinOrder(order.id);
                            setEnteredPin("");
                            setPinError("");
                          }}
                          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 text-xs font-semibold text-ivory-50 hover:bg-emerald-800"
                        >
                          <IconCheck className="h-4 w-4" /> ডেলিভারি কোড দিন
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* PIN Verification Modal */}
      {selectedPinOrder && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-3xl border border-line bg-paper p-6 shadow-xl space-y-4">
            <div className="text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
                <IconShield className="h-6 w-6" />
              </span>
              <h3 className="font-display mt-3 text-lg font-bold text-forest-900">
                ডেলিভারি ভেরিফিকেশন পিন
              </h3>
              <p className="mt-1 text-xs text-ink-soft">
                কাস্টমারের কাছ থেকে ৪-সংখ্যার কোডটি নিয়ে নিচে টাইপ করুন
              </p>
            </div>

            {pinError && (
              <p role="alert" className="rounded-xl bg-rose-50 p-2.5 text-center text-xs font-semibold text-rose-800">
                {pinError}
              </p>
            )}

            <div>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={enteredPin}
                onChange={(e) => setEnteredPin(e.target.value.replace(/\D/g, ""))}
                placeholder="• • • •"
                className="h-14 w-full rounded-2xl border border-line bg-ivory-50 text-center font-mono text-2xl font-bold tracking-[0.5em] text-forest-900 focus:outline-none focus:ring-2 focus:ring-forest-800"
                autoFocus
              />
              <p className="mt-2 text-center text-[11px] text-ink-soft">
                (ডেমো টেস্ট কোড: {getDeliveryCode(selectedPinOrder)})
              </p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSelectedPinOrder(null)}
                className="h-12 flex-1 rounded-full border border-line bg-paper text-xs font-semibold text-ink-soft hover:bg-ivory-100"
              >
                বাতিল
              </button>
              <button
                type="button"
                disabled={enteredPin.length !== 4}
                onClick={() => handleVerifyPin(selectedPinOrder)}
                className="h-12 flex-1 rounded-full bg-forest-800 text-xs font-semibold text-ivory-50 hover:bg-forest-900 disabled:opacity-50"
              >
                ডেলিভারি সম্পন্ন করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Navigation link */}
      <footer className="mt-auto border-t border-line bg-paper p-4 text-center">
        <Link
          href="/"
          className="text-xs font-medium text-forest-800 underline underline-offset-4"
        >
          ← স্টোরফ্রন্টে ফিরে যান
        </Link>
      </footer>
    </div>
  );
}
