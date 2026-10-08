"use client";

/**
 * /rider — the rider's board. Item Z split the old 1,100-line component:
 * the view-model lives in `lib/rider-tasks`, GPS in `use-rider-location`, the
 * offer beep in `use-offer-beep`, the two network steps in
 * `rider-delivery-actions`, and the visual blocks in `components/rider/dashboard/`.
 * This file only wires session, jobs and the action handlers together.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRiderJobs, useRiderSession, useRiderStats } from "@/lib/use-rider";
import { formatBdt } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { useOfferAlert } from "@/lib/use-offer-alert";
import { useOfferBeep } from "@/lib/use-offer-beep";
import { useRiderLocationTracking } from "@/lib/use-rider-location";
import { useRiderLiveBroadcast } from "@/lib/use-rider-live-broadcast";
import { useKeepAwakePref, useWakeLock } from "@/lib/use-wake-lock";
import { trackingState } from "@/lib/location-health";
import { cashMeter, countActiveTrips, offlineCashNote, offeredIds, toRiderTasks, type RiderTask } from "@/lib/rider-tasks";
import { IconBox, IconCheck } from "@/components/ui/icons";
import { RiderPushCard } from "@/components/rider/rider-push-card";
import { LicenceBanner } from "@/components/rider/licence-banner";
import { RiderTopBar } from "@/components/rider/dashboard/top-bar";
import { CashCard } from "@/components/rider/dashboard/cash-card";
import { StatsStrip } from "@/components/rider/dashboard/stats-strip";
import { TaskCard } from "@/components/rider/dashboard/task-card";
import { PinModal } from "@/components/rider/dashboard/pin-modal";
import { SettleModal } from "@/components/rider/dashboard/settle-modal";
import { LocationHealth } from "@/components/rider/dashboard/location-health";

export default function RiderPage() {
  const session = useRiderSession();
  const isLive = session.status === "authed";
  const activeRider = session.rider;
  const riderJobsApi = useRiderJobs(isLive, activeRider?.id);
  const riderStats = useRiderStats(isLive);

  const [onlineOverride, setOnlineOverride] = useState<boolean | null>(null);
  const isOnline = onlineOverride ?? activeRider?.isOnline ?? false;
  const [selectedPinTask, setSelectedPinTask] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [settle, setSettle] = useState(false);
  // Going offline with COD cash in the pocket used to be a silent tap. The
  // board now asks first — the money is not the rider's to carry home.
  const [offlineCashHold, setOfflineCashHold] = useState(false);
  const flashTimer = useRef<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);

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

  // J: the cap is an admin setting (stats.cashLimit); until it loads, the old default.
  const CASH_LIMIT_PAISA = riderStats.stats?.cashLimit ?? 500000;
  const cashInHand = activeRider?.cashInHand ?? 0;
  const isCashLimitReached = cashMeter(cashInHand, CASH_LIMIT_PAISA).reached;
  const cashNote = offlineCashNote(cashInHand);

  const tasks = useMemo<RiderTask[]>(() => toRiderTasks(riderJobsApi.jobs), [riderJobsApi.jobs]);
  // Ticks once a second only while an offer is on screen (the countdown);
  // otherwise once a minute for the "ago" labels.
  const hasOffer = tasks.some((t) => t.state === "offered");
  const hasActiveTrip = tasks.some((t) => t.state !== "offered");
  const now = useNow(hasOffer ? 1000 : 60_000);
  // Vibrate + flash the tab title when an offer that was not on the board before arrives.
  const offerIds = useMemo(() => offeredIds(tasks), [tasks]);
  useOfferAlert(
    offerIds,
    useCallback((n: number) => setFlash(n > 1 ? `${n}টি নতুন অফার এসেছে!` : "নতুন অফার এসেছে!"), []),
  );
  useOfferBeep(offerIds);
  // Live tracking: shout each fix on the channel of every job this rider is
  // carrying, so the customer's pin moves the instant the phone reports
  // instead of on the tracker's next poll. The PATCH below stays the source
  // of truth; this is only the fast lane, and it fails silent.
  const liveChannels = useMemo(
    () => riderJobsApi.jobs.map((j) => j.liveChannel ?? null),
    [riderJobsApi.jobs],
  );
  const broadcast = useRiderLiveBroadcast({ channels: liveChannels, enabled: isLive && isOnline });
  const gps = useRiderLocationTracking({
    enabled: isLive && isOnline,
    hasActiveTrip,
    send: (lat, lng) => {
      broadcast.publish(lat, lng);
      return riderJobsApi.updateLocation(lat, lng);
    },
  });
  // Q: a sleeping screen suspends GPS — hold it awake while a trip is running.
  const [keepAwake, setKeepAwake] = useKeepAwakePref();
  const wake = useWakeLock(isLive && isOnline && hasActiveTrip && keepAwake);
  const tracking = trackingState({
    enabled: isLive && isOnline,
    hasActiveTrip,
    permission: gps.permission,
    lastError: gps.lastError,
    lastFixAt: gps.lastFixAt,
    sendFailed: gps.sendFailed,
    now,
  });

  const deliveredCount = useMemo(
    () => riderJobsApi.jobs.filter((j) => j.state === "delivered").length,
    [riderJobsApi.jobs],
  );

  const toggleOnline = async (force = false) => {
    const nextState = !isOnline;
    // Switching OFF while holding cash: ask once, then let them decide.
    if (!nextState && !force && offlineCashNote(cashInHand) !== null) {
      setOfflineCashHold(true);
      return;
    }
    setOfflineCashHold(false);
    const ok = await riderJobsApi.setOnline(nextState);
    if (!ok) {
      setActionError(riderJobsApi.error);
      return;
    }
    setActionError(null);
    setOnlineOverride(nextState);
    // Server truth wins as soon as it lands: an optimistic override that
    // lived forever used to paint "online" over a staff-side suspend/off
    // until the next full reload (audit K).
    await session.refresh();
    setOnlineOverride(null);
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

  const handleAccept = async (task: RiderTask) => {
    if (accepting) return;
    setAccepting(task.id);
    const ok = await riderJobsApi.accept(task.id);
    setAccepting(null);
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
    showFlash(`অর্ডার #${task.order.id} পিকআপ সম্পন্ন! এখন কাস্টমারের পথে রওনা দিন।`);
  };

  /** PinModal's submit: the refusal text, or null once delivered. */
  const handleDeliver = async (
    task: RiderTask,
    pin: string,
    proofUrl: string | null,
    noPhotoReason: string | null,
  ): Promise<string | null> => {
    const ok = await riderJobsApi.deliver(task.id, pin, proofUrl, noPhotoReason);
    if (!ok) return riderJobsApi.error ?? "ভুল কোড!";
    setActionError(null);
    setSelectedPinTask(null);
    showFlash(
      `🎉 অভিনন্দন! অর্ডার #${task.order.id} সফলভাবে ডেলিভারি সম্পন্ন হয়েছে। Proof: ${proofUrl ? "with photo" : "no photo"}`,
    );
    void session.refresh();
    void riderStats.refresh();
    return null;
  };

  /** SettleModal's submit: the refusal text, or null once the claim was sent. */
  const handleSettleCash = async (method: string, reference: string): Promise<string | null> => {
    const ok = await riderJobsApi.settle(method, reference);
    if (!ok) return riderJobsApi.error ?? "দাবি পাঠানো যায়নি — আবার চেষ্টা করুন।";
    setActionError(null);
    void session.refresh();
    setSettle(false);
    showFlash("টাকা জমার দাবি Admin-এর কাছে পাঠানো হয়েছে। Approve হলে balance কমবে।");
    return null;
  };

  const pinTask = selectedPinTask ? (tasks.find((t) => t.id === selectedPinTask) ?? null) : null;
  const activeTrips = countActiveTrips(tasks);

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
      <RiderTopBar name={activeRider.name} live={riderJobsApi.live} isOnline={isOnline} onToggle={() => void toggleOnline()} />

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
        {/* I: background offer alerts (Web Push) — one tap, quiet once on. */}
        <RiderPushCard enabled={isLive} />
        {/* N: licence about to lapse / lapsed. */}
        {activeRider && <LicenceBanner vehicle={activeRider.vehicle} expiresOn={activeRider.licenceExpiresOn} />}
        {(actionError || riderJobsApi.error) && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-2xl bg-rose-50 p-4 text-xs font-semibold text-rose-900 ring-1 ring-rose-300"
          >
            <span>{actionError || riderJobsApi.error}</span>
            <button
              type="button"
              onClick={() => { setActionError(null); void riderJobsApi.refresh(); }}
              className="ml-auto rounded-full px-2 py-0.5 text-rose-700 underline"
            >
              বন্ধ
            </button>
          </div>
        )}


        <LocationHealth
          state={tracking}
          hasActiveTrip={hasActiveTrip}
          wakeSupported={wake.supported}
          keepAwake={keepAwake}
          awakeHeld={wake.held}
          onKeepAwakeChange={setKeepAwake}
        />

        {/* Today (Dhaka): what the day has earned so far. Hidden until the
            figures arrive — never a fake ৳0. */}
        {riderStats.stats?.todayDeliveries !== undefined && (
          <Link
            href="/rider/earnings"
            data-testid="rider-today"
            className="flex items-center justify-between rounded-2xl bg-forest-900 px-4 py-3 text-ivory-50 shadow-sm"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ivory-100/70">আজকের হিসাব</span>
            <span className="text-sm font-semibold">
              {riderStats.stats.todayDeliveries} ডেলিভারি
              {riderStats.stats.todayEarned !== undefined && (
                <span className="ml-2 text-gold-300">{formatBdt(riderStats.stats.todayEarned)}</span>
              )}
              <span className="ml-1 text-ivory-100/60">›</span>
            </span>
          </Link>
        )}

        {offlineCashHold && cashNote ? (
          <div
            role="alert"
            data-testid="rider-offline-cash-nudge"
            className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-300"
          >
            <p className="text-xs font-semibold text-amber-900">{cashNote}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setOfflineCashHold(false);
                  setSettle(true);
                }}
                className="min-h-11 rounded-full bg-forest-800 px-4 text-xs font-semibold text-ivory-50 hover:bg-forest-700"
              >
                টাকা জমা দিন
              </button>
              <button
                type="button"
                data-testid="rider-offline-anyway"
                onClick={() => void toggleOnline(true)}
                className="min-h-11 rounded-full px-4 text-xs font-semibold text-ink-soft ring-1 ring-line hover:text-ink"
              >
                তবুও অফলাইন যাব
              </button>
            </div>
          </div>
        ) : null}

        <CashCard
          cashInHand={cashInHand}
          limit={CASH_LIMIT_PAISA}
          pendingClaim={riderJobsApi.pendingClaim}
          claimsReady={riderJobsApi.claimsReady}
          earningsBalance={riderStats.stats?.earningsBalance ?? 0}
          onSettle={() => setSettle(true)}
        />

        <StatsStrip activeTrips={activeTrips} deliveredCount={deliveredCount} stats={riderStats.stats} />

        {/* Active Jobs Section */}
        <section aria-label="Active tasks">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-base font-semibold text-forest-900">
              অ্যাসাইন্ড অর্ডার সমূহ ({tasks.length})
            </h2>
            <span className="text-xs text-ink-soft">৪৫-৬০ মিনিট ডেলিভারি</span>
          </div>

          {!isOnline && tasks.length === 0 ? (
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
                দোকান পার্সেল প্রস্তুত করলে আপনার এলাকার অনলাইন রাইডারদের এখানে অনুরোধ দেখাবে। অ্যাপ খোলা রাখুন—প্রতি ১৫ সেকেন্ডে আপডেট হয়।
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {tasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  now={now}
                  isOnline={isOnline}
                  cashLimitReached={isCashLimitReached}
                  accepting={accepting}
                  onAccept={handleAccept}
                  onReject={handleReject}
                  onPickup={handlePickup}
                  onEnterCode={(t) => setSelectedPinTask(t.id)}
                  onFailedRecorded={(message) => {
                    showFlash(message);
                    void riderJobsApi.refresh();
                  }}
                  onReleased={(message) => {
                    showFlash(message);
                    void riderJobsApi.refresh();
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {pinTask && (
        <PinModal
          key={pinTask.id}
          onSubmit={(pin, proofUrl, reason) => handleDeliver(pinTask, pin, proofUrl, reason)}
          onClose={() => setSelectedPinTask(null)}
          onFlash={showFlash}
        />
      )}

      {settle && (
        <SettleModal cashInHand={cashInHand} onSubmit={handleSettleCash} onClose={() => setSettle(false)} />
      )}

      {/* Footer Navigation link */}
      <footer className="mt-auto border-t border-line bg-paper p-4 text-center">
        <Link href="/" className="text-xs font-medium text-forest-800 underline underline-offset-4">
          ← স্টোরফ্রন্টে ফিরে যান
        </Link>
      </footer>
    </div>
  );
}
