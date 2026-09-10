"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useOrders } from "@/lib/use-orders";
import { useRiders } from "@/lib/use-riders";
import { useRiderJobs, useRiderSession } from "@/lib/use-rider";
import { formatBdt } from "@/lib/format";
import { getDeliveryCode, type Order } from "@/lib/orders";
import type { RiderJob } from "@/lib/db/riders";
import {
  IconBox,
  IconCheck,
  IconMapPin,
  IconPhone,
  IconShield,
  IconTruck,
} from "@/components/ui/icons";

interface RiderTask {
  /** Identifier of the action target — assignment id live, order id in demo. */
  id: string;
  order: Order;
  state: "offered" | "accepted" | "picked_up" | "delivered";
}

const DEMO_RIDER = {
  id: "rider-default",
  name: "তানভীর আহমেদ (Tanvir)",
  phone: "01811111111",
  vehicle: "bike",
  zoneIds: [] as string[],
  status: "active" as const,
  isOnline: true,
  cashInHand: 156000,
  ratingAvg: 4.9,
  ratingCount: 18,
};

export default function RiderPage() {
  const session = useRiderSession();
  const isLive = session.status === "authed";
  const { orders: demoOrders, advance } = useOrders();
  const { riders, saveRider } = useRiders();
  const riderJobsApi = useRiderJobs(isLive);

  const activeRider = useMemo(() => {
    if (isLive && session.rider) return session.rider;
    return (
      riders.find((r) => r.status === "active") ??
      riders[0] ??
      DEMO_RIDER
    );
  }, [isLive, session.rider, riders]);

  const [isOnline, setIsOnline] = useState(activeRider.isOnline);
  const [selectedPinTask, setSelectedPinTask] = useState<string | null>(null);
  const [enteredPin, setEnteredPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [settle, setSettle] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [proofUploading, setProofUploading] = useState(false);
  const [failedReason, setFailedReason] = useState("");
  const [showFailed, setShowFailed] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    },
    [],
  );

  const showFlash = (message: string) => {
    setFlash(message);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 3500);
  };

  const CASH_LIMIT_PAISA = 500000;
  const isCashLimitReached = activeRider.cashInHand >= CASH_LIMIT_PAISA;

  const tasks = useMemo<RiderTask[]>(() => {
    if (isLive) {
      return riderJobsApi.jobs
        .filter(
          (job) =>
            job.state !== "delivered" &&
            job.state !== "cancelled" &&
            job.state !== "expired",
        )
        .map((job: RiderJob) => ({
          id: job.id,
          order: job.order,
          state:
            job.state === "offered"
              ? "offered"
              : job.state === "picked_up"
                ? "picked_up"
                : "accepted",
        }));
    }
    return demoOrders
      .filter(
        (o) =>
          o.status === "ready-for-pickup" ||
          o.status === "courier-assigned" ||
          o.status === "out-for-delivery",
      )
      .map((order) => ({
        id: order.id,
        order,
        state:
          order.status === "out-for-delivery" ? "picked_up" : "accepted",
      }));
  }, [isLive, riderJobsApi.jobs, demoOrders]);

  const deliveredCount = useMemo(() => {
    if (isLive) {
      return riderJobsApi.jobs.filter((j) => j.state === "delivered").length;
    }
    return demoOrders.filter((o) => o.status === "delivered").length;
  }, [isLive, riderJobsApi.jobs, demoOrders]);

  const toggleOnline = async () => {
    const nextState = !isOnline;
    if (isLive) {
      const ok = await riderJobsApi.setOnline(nextState);
      if (!ok) {
        setActionError(riderJobsApi.error);
        return;
      }
      setActionError(null);
    } else {
      void saveRider({ ...activeRider, isOnline: nextState });
    }
    setIsOnline(nextState);
    void session.refresh();
  };

  const handleAccept = async (task: RiderTask) => {
    if (!isLive) return;
    const ok = await riderJobsApi.accept(task.id);
    if (!ok) {
      setActionError(riderJobsApi.error);
      return;
    }
    setActionError(null);
    showFlash("অর্ডার একসেপ্ট হয়েছে! পিকআপ কনফার্ম করুন।");
  };

  const handleReject = async (task: RiderTask) => {
    if (!isLive) return;
    const ok = await riderJobsApi.reject(task.id);
    if (!ok) {
      setActionError(riderJobsApi.error);
      return;
    }
    setActionError(null);
    showFlash("অফারটি বাতিল করা হয়েছে।");
  };

  const handlePickup = async (task: RiderTask) => {
    if (isLive) {
      const ok = await riderJobsApi.pickup(task.id);
      if (!ok) {
        setActionError(riderJobsApi.error);
        return;
      }
      setActionError(null);
      showFlash(
        `অর্ডার #${task.order.id} পিকআপ সম্পন্ন! এখন কাস্টমারের পথে রওনা দিন।`,
      );
      return;
    }
    const ok = await advance(
      task.order.id,
      "out-for-delivery",
      "রাইডার পার্সেল সংগ্রহ করেছেন",
    );
    if (ok) {
      showFlash(
        `অর্ডার #${task.order.id} পিকআপ সম্পন্ন! এখন কাস্টমারের পথে রওনা দিন।`,
      );
    }
  };

  const handleProofUpload = async (file: File) => {
    if (!file) return;
    setProofUploading(true);
    setPinError("");
    try {
      // Get Cloudinary signature
      const signRes = await fetch("/api/media/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder: "prosanti/delivery-proofs" }),
      });
      const signData = await signRes.json().catch(() => null) as any;
      if (!signRes.ok || !signData?.cloudName) {
        // Fallback: if Cloudinary not configured, use local preview (demo)
        const localUrl = URL.createObjectURL(file);
        setProofUrl(localUrl);
        showFlash("Cloudinary not configured - demo preview only. Configure CLOUDINARY_*");
        return;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", signData.apiKey);
      form.append("timestamp", String(signData.timestamp));
      form.append("folder", signData.folder);
      form.append("signature", signData.signature);
      const upRes = await fetch(`https://api.cloudinary.com/v1_1/${signData.cloudName}/image/upload`, {
        method: "POST",
        body: form,
      });
      const upData = await upRes.json().catch(() => null) as any;
      if (!upRes.ok || !upData?.secure_url) {
        throw new Error(upData?.error?.message || "Upload failed");
      }
      setProofUrl(upData.secure_url);
      showFlash("📸 Proof photo uploaded to Cloudinary!");
    } catch (e: any) {
      setPinError(e?.message || "Photo upload failed");
    } finally {
      setProofUploading(false);
    }
  };

  const handleVerifyPin = async (task: RiderTask) => {
    if (isLive) {
      const ok = await riderJobsApi.deliver(task.id, enteredPin.trim(), proofUrl);
      if (!ok) {
        setPinError(riderJobsApi.error ?? "ভুল কোড!");
        return;
      }
      setActionError(null);
      setSelectedPinTask(null);
      setEnteredPin("");
      setPinError("");
      setProofUrl(null);
      showFlash(
        `🎉 অভিনন্দন! অর্ডার #${task.order.id} সফলভাবে ডেলিভারি সম্পন্ন হয়েছে। Proof: ${proofUrl ? "with photo" : "no photo"}`,
      );
      void session.refresh();
      return;
    }

    const order = demoOrders.find((o) => o.id === task.order.id);
    if (!order) return;
    const expectedCode = order.deliveryCode ?? getDeliveryCode(order.id);
    if (enteredPin.trim() !== expectedCode) {
      setPinError("ভুল কোড! সঠিক ৪-সংখ্যার কোডটি কাস্টমারের কাছ থেকে নিন।");
      return;
    }
    const ok = await advance(order.id, "delivered", "সফল ডেলিভারি সম্পন্ন ও ক্যাশ গ্রহণ");
    if (!ok) return;
    void saveRider({
      ...activeRider,
      cashInHand: activeRider.cashInHand + order.total,
    });
    setSelectedPinTask(null);
    setEnteredPin("");
    setPinError("");
    setProofUrl(null);
    showFlash(
      `🎉 অভিনন্দন! অর্ডার #${order.id} সফলভাবে ডেলিভারি সম্পন্ন হয়েছে।`,
    );
  };

  const handleSettleCash = async () => {
    if (
      !window.confirm(
        `আপনি কি অফিসে/bKash-এ ${formatBdt(activeRider.cashInHand)} টাকা জমা দিয়ে ক্যাশ সেটেল করতে চান?`,
      )
    )
      return;
    if (isLive) {
      const ok = await riderJobsApi.settle("cash", "");
      if (!ok) {
        setActionError(riderJobsApi.error);
        setSettle(false);
        return;
      }
      setActionError(null);
      void session.refresh();
    } else {
      void saveRider({ ...activeRider, cashInHand: 0 });
    }
    setSettle(false);
    showFlash("ক্যাশ সেটেলমেন্ট সম্পন্ন হয়েছে! নতুন ট্রিপ একসেপ্ট করতে পারবেন।");
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
        {actionError && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-2xl bg-rose-50 p-4 text-xs font-semibold text-rose-900 ring-1 ring-rose-300"
          >
            <span>{actionError}</span>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="ml-auto rounded-full px-2 py-0.5 text-rose-700 underline"
            >
              বন্ধ
            </button>
          </div>
        )}

        {/* Cash-in-hand safety meter card */}
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
                onClick={() => setSettle(true)}
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
              ⚠️ ক্যাশ লিমিট পূর্ণ হয়েছে! নতুন অর্ডার পেতে অফিসে বা bKash-এ টাকা জমা দিন।
            </p>
          )}
        </section>

        {/* Recent cash pay-ins (live only; demo has no persisted ledger) */}
        {isLive && riderJobsApi.settlements.length > 0 && (
          <section aria-label="Recent settlements">
            <h2 className="font-display mb-3 text-base font-semibold text-forest-900">
              সাম্প্রতিক টাকা জমা (Settlement ইতিহাস)
            </h2>
            <ul className="space-y-2">
              {riderJobsApi.settlements.slice(0, 6).map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-xl bg-paper p-3 text-xs ring-1 ring-line"
                >
                  <div>
                    <p className="font-semibold text-forest-900">
                      {formatBdt(s.amount)} · {s.method.toUpperCase()}
                    </p>
                    <p className="mt-0.5 text-ink-soft">
                      {new Date(s.at).toLocaleString("bn-BD", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {s.reference ? ` · ${s.reference}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Quick Stats Strip */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-line bg-paper p-3.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              চলমান ডেলিভারি
            </p>
            <p className="font-display mt-1 text-2xl font-bold text-forest-900">
              {tasks.length}
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-paper p-3.5 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
              মোট সম্পন্ন
            </p>
            <p className="font-display mt-1 text-2xl font-bold text-emerald-700">
              {deliveredCount}
            </p>
          </div>
        </div>

        {/* Active Jobs Section */}
        <section aria-label="Active tasks">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-semibold text-forest-900">
              অ্যাসাইন্ড অর্ডার সমূহ ({tasks.length})
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
          ) : tasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-ivory-100/50 p-8 text-center">
              <IconBox className="mx-auto h-8 w-8 text-ink-soft/60" />
              <p className="mt-2 text-sm font-semibold text-forest-900">
                বর্তমানে কোনো সক্রিয় ট্রিপ নেই
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                দোকানদার পার্সেল রেডি করলেই এখানে নোটিফিকেশন আসবে।
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {tasks.map((task) => {
                const isOut = task.state === "picked_up";
                const isReady =
                  task.state === "accepted" || task.state === "offered";
                const order = task.order;

                return (
                  <div
                    key={task.id}
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
                    <div className="flex flex-col gap-2 pt-1">
                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${order.customer.phone}`}
                          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-paper text-xs font-semibold text-forest-900 hover:bg-ivory-100"
                        >
                          <IconPhone className="h-4 w-4 text-forest-700" /> কল দিন
                        </a>

                      {task.state === "offered" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleReject(task)}
                            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-line bg-paper text-xs font-semibold text-rose-700 hover:bg-rose-50"
                          >
                            বাতিল
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAccept(task)}
                            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gold-600 text-xs font-semibold text-forest-950 hover:bg-gold-500"
                          >
                            অর্ডার একসেপ্ট করুন
                          </button>
                        </>
                      ) : isReady ? (
                        <button
                          type="button"
                          onClick={() => handlePickup(task)}
                          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-forest-800 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
                        >
                          পিকআপ কনফার্ম করুন
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPinTask(task.id);
                            setEnteredPin("");
                            setPinError("");
                            setProofUrl(null);
                          }}
                          className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 text-xs font-semibold text-ivory-50 hover:bg-emerald-800"
                        >
                          <IconCheck className="h-4 w-4" /> ডেলিভারি কোড দিন
                        </button>
                      )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowFailed(showFailed === task.id ? null : task.id)}
                        className="text-[11px] text-rose-700 underline"
                      >
                        Customer unreachable? Report failed attempt
                      </button>
                      {showFailed === task.id && (
                        <div className="rounded-xl bg-rose-50 p-3 ring-1 ring-rose-200 space-y-2">
                          <input
                            value={failedReason}
                            onChange={(e) => setFailedReason(e.target.value)}
                            placeholder="Reason: phone off, address wrong, etc"
                            className="w-full rounded-lg bg-white px-3 py-2 text-xs ring-1 ring-line"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                if (isLive) {
                                  const res = await fetch(`/api/rider/assignments/${task.id}/failed`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ reason: failedReason }),
                                  });
                                  if (res.ok) {
                                    showFlash("Failed attempt recorded");
                                    setShowFailed(null);
                                    setFailedReason("");
                                  } else {
                                    const d = await res.json().catch(() => null) as any;
                                    setPinError(d?.error || "Failed");
                                  }
                                } else {
                                  showFlash("Demo: failed attempt logged");
                                  setShowFailed(null);
                                }
                              }}
                              className="rounded-full bg-rose-700 px-3 py-1 text-xs font-semibold text-white"
                            >
                              Submit failed
                            </button>
                            <button type="button" onClick={() => setShowFailed(null)} className="text-xs text-ink-soft">Cancel</button>
                          </div>
                        </div>
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
      {selectedPinTask && (
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
                কাস্টমারের কাছ থেকে ৪-সংখ্যার কোডটি নিয়ে নিচে টাইপ করুন
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
              {!isLive && (() => {
                const demoTask = tasks.find((t) => t.id === selectedPinTask);
                const code = demoTask ? (demoTask.order.deliveryCode ?? getDeliveryCode(demoTask.order.id)) : getDeliveryCode(selectedPinTask);
                return (
                  <p className="mt-2 text-center text-[11px] text-ink-soft">
                    (ডেমো টেস্ট কোড: {code})
                  </p>
                );
              })()}
            </div>

            {/* Cloudinary Proof Photo */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">📸 Delivery Proof Photo (Cloudinary)</p>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleProofUpload(f);
                }}
                className="w-full rounded-xl bg-ivory-100 px-3 py-2 text-xs ring-1 ring-line"
              />
              {proofUploading && <p className="text-xs text-amber-700">Uploading to Cloudinary...</p>}
              {proofUrl && (
                <div className="rounded-xl overflow-hidden ring-1 ring-line">
                  <img src={proofUrl} alt="Proof" className="w-full h-32 object-cover" />
                  <p className="p-2 text-[10px] break-all text-ink-soft">{proofUrl}</p>
                </div>
              )}
              <p className="text-[11px] text-ink-soft">Photo ta Cloudinary te jabe - `prosanti/delivery-proofs` folder. Optional but recommended.</p>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSelectedPinTask(null)}
                className="h-12 flex-1 rounded-full border border-line bg-paper text-xs font-semibold text-ink-soft hover:bg-ivory-100"
              >
                বাতিল
              </button>
              <button
                type="button"
                disabled={enteredPin.length !== 4}
                onClick={() => {
                  const task = tasks.find((t) => t.id === selectedPinTask);
                  if (task) void handleVerifyPin(task);
                }}
                className="h-12 flex-1 rounded-full bg-forest-800 text-xs font-semibold text-ivory-50 hover:bg-forest-900 disabled:opacity-50"
              >
                ডেলিভারি সম্পন্ন করুন
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash settlement confirm */}
      {settle && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-sm rounded-3xl border border-line bg-paper p-6 shadow-xl space-y-4">
            <div className="text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-forest-100 text-forest-800">
                <IconShield className="h-6 w-6" />
              </span>
              <h3 className="font-display mt-3 text-lg font-bold text-forest-900">
                ক্যাশ সেটেলমেন্ট
              </h3>
              <p className="mt-1 text-xs text-ink-soft">
                {formatBdt(activeRider.cashInHand)} অফিসে বা bKash-এ জমা দিয়ে
                নিশ্চিত করুন।
              </p>
            </div>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setSettle(false)}
                className="h-12 flex-1 rounded-full border border-line bg-paper text-xs font-semibold text-ink-soft hover:bg-ivory-100"
              >
                বাতিল
              </button>
              <button
                type="button"
                onClick={handleSettleCash}
                className="h-12 flex-1 rounded-full bg-forest-800 text-xs font-semibold text-ivory-50 hover:bg-forest-900"
              >
                নিশ্চিত করুন
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
