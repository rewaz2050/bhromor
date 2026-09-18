"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRiderJobs, useRiderSession } from "@/lib/use-rider";
import { formatBdt } from "@/lib/format";
import { deliverySlotSummary } from "@/lib/delivery-slots";
import type { Order } from "@/lib/orders";
import type { RiderJob } from "@/lib/db/riders";
import {
  availabilityLabel,
  isOnShift,
  type RiderAvailability,
} from "@/lib/rider-hours";
import {
  IconBox,
  IconCheck,
  IconMapPin,
  IconPhone,
  IconShield,
  IconTruck,
} from "@/components/ui/icons";

interface RiderTask {
  /** Identifier of the action target — the live assignment id. */
  id: string;
  order: Order;
  state: "offered" | "accepted" | "picked_up" | "delivered";
}

export default function RiderPage() {
  const session = useRiderSession();
  const isLive = session.status === "authed";
  const riderJobsApi = useRiderJobs(isLive);
  const activeRider = session.rider;

  const [isOnline, setIsOnline] = useState(activeRider?.isOnline ?? false);
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
  const cashInHand = activeRider?.cashInHand ?? 0;
  const isCashLimitReached = cashInHand >= CASH_LIMIT_PAISA;

  const tasks = useMemo<RiderTask[]>(
    () =>
      riderJobsApi.jobs
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
        })),
    [riderJobsApi.jobs],
  );

  const deliveredCount = useMemo(
    () => riderJobsApi.jobs.filter((j) => j.state === "delivered").length,
    [riderJobsApi.jobs],
  );

  const toggleOnline = async () => {
    const nextState = !isOnline;
    const ok = await riderJobsApi.setOnline(nextState);
    if (!ok) {
      setActionError(riderJobsApi.error);
      return;
    }
    setActionError(null);
    setIsOnline(nextState);
    void session.refresh();
    if (nextState && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          void riderJobsApi.updateLocation(pos.coords.latitude, pos.coords.longitude);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 8000 },
      );
    }
  };

  // Auto location tracking when online (every 30s)
  useEffect(() => {
    if (!isLive || !isOnline) return;
    let watchId: number | null = null;
    let intervalId: number | null = null;

    const sendLocation = (lat: number, lng: number) => {
      void riderJobsApi.updateLocation(lat, lng);
    };

    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude),
        () => {},
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
      );
      // Fallback interval
      intervalId = window.setInterval(() => {
        navigator.geolocation.getCurrentPosition(
          (pos) => sendLocation(pos.coords.latitude, pos.coords.longitude),
          () => {},
          { enableHighAccuracy: false, timeout: 8000 },
        );
      }, 30000);
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      if (intervalId !== null) window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLive, isOnline]);

  const handleAccept = async (task: RiderTask) => {
    const ok = await riderJobsApi.accept(task.id);
    if (!ok) {
      setActionError(riderJobsApi.error);
      return;
    }
    setActionError(null);
    showFlash("অর্ডার একসেপ্ট হয়েছে! পিকআপ কনফার্ম করুন।");
  };

  const handleReject = async (task: RiderTask) => {
    const ok = await riderJobsApi.reject(task.id);
    if (!ok) {
      setActionError(riderJobsApi.error);
      return;
    }
    setActionError(null);
    showFlash("অফারটি বাতিল করা হয়েছে।");
  };

  const handlePickup = async (task: RiderTask) => {
    const ok = await riderJobsApi.pickup(task.id);
    if (!ok) {
      setActionError(riderJobsApi.error);
      return;
    }
    setActionError(null);
    showFlash(
      `অর্ডার #${task.order.id} পিকআপ সম্পন্ন! এখন কাস্টমারের পথে রওনা দিন।`,
    );
  };

  const handleProofUpload = async (file: File) => {
    if (!file) return;
    setProofUploading(true);
    setPinError("");
    try {
      // Rider-scoped Cloudinary signature (the staff /api/media/sign
      // answers 403 to a rider session).
      const signRes = await fetch("/api/rider/media/sign", { method: "POST" });
      const signData = (await signRes.json().catch(() => null)) as
        | {
            cloudName?: string;
            apiKey?: string;
            timestamp?: number;
            folder?: string;
            signature?: string;
            uploadUrl?: string;
            error?: string;
          }
        | null;
      if (!signRes.ok || !signData?.cloudName || !signData.uploadUrl) {
        setPinError(
          signData?.error ||
            (signRes.status === 503
              ? "Photo upload is not configured yet — you can still deliver without a photo."
              : "Photo upload unavailable right now — you can still deliver without a photo."),
        );
        return;
      }
      const form = new FormData();
      form.append("file", file);
      form.append("api_key", signData.apiKey ?? "");
      form.append("timestamp", String(signData.timestamp ?? ""));
      form.append("folder", signData.folder ?? "");
      form.append("signature", signData.signature ?? "");
      const upRes = await fetch(signData.uploadUrl, { method: "POST", body: form });
      const upData = (await upRes.json().catch(() => null)) as
        | { secure_url?: string; error?: { message?: string } }
        | null;
      if (!upRes.ok || !upData?.secure_url) {
        throw new Error(upData?.error?.message || "Upload failed");
      }
      setProofUrl(upData.secure_url);
      showFlash("📸 Proof photo uploaded!");
    } catch (e) {
      setPinError(e instanceof Error && e.message ? e.message : "Photo upload failed");
    } finally {
      setProofUploading(false);
    }
  };

  const handleVerifyPin = async (task: RiderTask) => {
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
  };

  const handleSettleCash = async () => {
    if (
      !window.confirm(
        `আপনি কি অফিসে/bKash-এ ${formatBdt(cashInHand)} টাকা জমা দিয়ে ক্যাশ সেটেল করতে চান?`,
      )
    )
      return;
    const ok = await riderJobsApi.settle("cash", "");
    if (!ok) {
      setActionError(riderJobsApi.error);
      setSettle(false);
      return;
    }
    setActionError(null);
    void session.refresh();
    setSettle(false);
    showFlash("ক্যাশ সেটেলমেন্ট সম্পন্ন হয়েছে! নতুন ট্রিপ একসেপ্ট করতে পারবেন।");
  };

  if (!activeRider) {
    return (
      <div className="mx-auto max-w-md px-6 py-16 text-center" aria-label="Loading">
        <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-line/70" />
        <p className="mt-4 text-sm text-ink-soft">রাইডার অ্যাকাউন্ট যাচাই হচ্ছে…</p>
      </div>
    );
  }

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

        {/* P2 #22 — the rider's own shift. Auto-dispatch only offers jobs
            inside it (enforced in the database, not just here), so this card
            is real scheduling, not decoration. */}
        <RiderShiftCard rider={activeRider} onSave={session.setAvailability} flash={setFlash} />

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
              {formatBdt(cashInHand)}
            </p>
            {cashInHand > 0 && (
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
                  : cashInHand > 300000
                    ? "bg-amber-500"
                    : "bg-emerald-600"
              }`}
              style={{
                width: `${Math.min(100, Math.round((cashInHand / CASH_LIMIT_PAISA) * 100))}%`,
              }}
            />
          </div>

          {isCashLimitReached && (
            <p className="mt-2 text-xs font-semibold text-rose-700">
              ⚠️ ক্যাশ লিমিট পূর্ণ হয়েছে! নতুন অর্ডার পেতে অফিসে বা bKash-এ টাকা জমা দিন।
            </p>
          )}
        </section>

        {/* Recent cash pay-ins */}
        {riderJobsApi.settlements.length > 0 && (
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
                                  const d = (await res.json().catch(() => null)) as { error?: string } | null;
                                  setPinError(d?.error || "Failed");
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
                  <div className="relative h-32 w-full">
                    <Image
                      src={proofUrl}
                      alt="Delivery proof photo"
                      fill
                      sizes="100vw"
                      className="object-cover"
                    />
                  </div>
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
                {formatBdt(cashInHand)} অফিসে বা bKash-এ জমা দিয়ে
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
const SHIFT_DAYS = ["শু", "ম", "বু", "বৃ", "শু", "শ", "ছ"] as const;
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

function RiderShiftCard({
  rider,
  onSave,
  flash,
}: {
  rider: import("@/lib/catalog").Rider | null;
  onSave: (payload: { fromHour: number | null; toHour: number | null; days: number[] }) => Promise<string | null>;
  flash: (msg: string) => void;
}) {
  const availFromHour = rider?.availability?.fromHour ?? null;
  const availToHour = rider?.availability?.toHour ?? null;
  const availDaysKey = JSON.stringify(rider?.availability?.days ?? null);
  // Rebuilt from the three primitives so the effect below can depend on
  // stable values (a fresh object every render would re-arm the interval).
  const avail = useMemo<RiderAvailability>(
    () => ({
      fromHour: availFromHour,
      toHour: availToHour,
      days: JSON.parse(availDaysKey) as number[] | null,
    }),
    [availFromHour, availToHour, availDaysKey],
  );
  const [from, setFrom] = useState<string>(avail.fromHour === null ? "" : String(avail.fromHour));
  const [to, setTo] = useState<string>(avail.toHour === null ? "" : String(avail.toHour));
  const [days, setDays] = useState<number[]>(avail.days ?? []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "on shift right now?" is wall-clock — computed after mount, never during
  // render, and refreshed once a minute so the badge cannot lie for long.
  const [onShift, setOnShift] = useState<boolean | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clock badge
    setOnShift(isOnShift(avail, Date.now()));
    const id = window.setInterval(() => setOnShift(isOnShift(avail, Date.now())), 60_000);
    return () => window.clearInterval(id);
  }, [avail]);

  const dirty =
    from !== (avail.fromHour === null ? "" : String(avail.fromHour)) ||
    to !== (avail.toHour === null ? "" : String(avail.toHour)) ||
    JSON.stringify([...days].sort()) !== JSON.stringify([...(avail.days ?? [])].sort());

  const save = async () => {
    setSaving(true);
    setError(null);
    const err = await onSave({
      fromHour: from === "" ? null : Number(from),
      toHour: to === "" ? null : Number(to),
      days: [...days].sort((a, b) => a - b),
    });
    setSaving(false);
    if (err) setError(err);
    else flash("শিফট সেভ হয়েছে — এখন থেকে অফার এই ঘরেই আসবে");
  };

  return (
    <section
      aria-label="Shift settings"
      className="rounded-2xl border border-line bg-ivory-100/70 p-4 shadow-sm"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <IconMapPin className="h-4 w-4 text-forest-700" />
          <span className="text-xs font-bold uppercase tracking-wider text-forest-900">
            আমার শিফট (Gig hours)
          </span>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            onShift === null
              ? "bg-gray-200 text-gray-600"
              : onShift
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
          }`}
        >
          {onShift === null ? "…" : onShift ? "Shift-এ আছেন" : "Shift-এর বাইরে"}
        </span>
      </div>
      <p className="mt-1.5 text-[11px] leading-5 text-ink-soft">
        নতুন অর্ডারের অফার শুধু এই সময়ের মধ্যেই আসবে — বাইরে থাকলে অ্যাপ খোলা থাকলেও আসবে না।{" "}
        <span className="whitespace-nowrap font-semibold">{availabilityLabel({ fromHour: from === "" ? null : Number(from), toHour: to === "" ? null : Number(to), days: days.length > 0 ? days : null })}</span>
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <label className="flex items-center gap-1.5">
          <span className="text-ink-soft">থেকে</span>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-lg border border-line bg-white px-2"
            aria-label="Shift start hour (Dhaka)"
          >
            <option value="">যেকোনো সময় — Any</option>
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={String(h)}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-ink-soft">পর্যন্ত</span>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-lg border border-line bg-white px-2"
            aria-label="Shift end hour (Dhaka)"
          >
            <option value="">সারারাত — Any</option>
            {Array.from({ length: 25 }, (_, h) => h).slice(1).map((h) => (
              <option key={h} value={String(h)}>
                {String(h % 24).padStart(2, "0")}:00{h === 24 ? " (মধ্যরাত)" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Working days">
        {DAY_NAMES.map((name, d) => {
          const on = days.includes(d);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              onClick={() => setDays((cur) => (on ? cur.filter((x) => x !== d) : [...cur, d]))}
              className={`h-8 min-w-9 rounded-full px-2 text-[11px] font-bold ring-1 transition-colors ${
                on ? "bg-forest-800 text-white ring-forest-700" : "bg-white text-ink-soft ring-line"
              }`}
              title={name}
            >
              {SHIFT_DAYS[d]}
            </button>
          );
        })}
        {(from !== "" || to !== "" || days.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              setDays([]);
            }}
            className="h-8 rounded-full px-2 text-[11px] font-semibold text-forest-800 underline underline-offset-2"
          >
            যেকোনো সময়
          </button>
        )}
      </div>
      {error ? <p className="mt-2 text-[11px] font-semibold text-rose-700">{error}</p> : null}
      {dirty ? (
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="mt-3 h-10 w-full rounded-xl bg-forest-800 text-xs font-bold text-white disabled:opacity-60"
        >
          {saving ? "সেভ হচ্ছে…" : "শিফট সেভ করুন"}
        </button>
      ) : null}
    </section>
  );
}
