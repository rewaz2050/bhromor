"use client";

import {
  trackingNotice,
  type LocationEngine,
  type TrackingState,
} from "@/lib/location-health";

/**
 * Tells the rider when their phone stopped reporting its position (permission
 * revoked, no GPS, app was in the background) and, during a trip, offers the
 * "keep screen on" switch that prevents the most common cause. Renders nothing
 * while everything is fine and there is nothing to switch.
 */
export function LocationHealth({
  state,
  hasActiveTrip,
  wakeSupported,
  keepAwake,
  awakeHeld,
  onKeepAwakeChange,
  engine = null,
}: {
  state: TrackingState;
  hasActiveTrip: boolean;
  wakeSupported: boolean;
  keepAwake: boolean;
  /** The browser actually granted the wake lock right now. */
  awakeHeld: boolean;
  onKeepAwakeChange: (next: boolean) => void;
  /** `native` inside the installed app — tracking survives the screen sleeping. */
  engine?: LocationEngine | null;
}) {
  const notice = trackingNotice(state, hasActiveTrip, engine);
  // Inside the app the OS keeps the service alive, so holding the screen on
  // would only burn the rider's battery for nothing.
  const showSwitch = hasActiveTrip && wakeSupported && state !== "off" && engine !== "native";
  const nativeLive = engine === "native" && state !== "off";
  if (!notice && !showSwitch) return null;
  return (
    <section aria-label="Location" data-testid="location-health" className="space-y-2">
      {notice && (
        <div
          role="alert"
          data-state={state}
          className={`rounded-2xl p-3.5 text-xs ring-1 ${
            notice.tone === "bad" ? "bg-rose-50 text-rose-900 ring-rose-300" : "bg-amber-50 text-amber-900 ring-amber-300"
          }`}
        >
          <p className="font-semibold">📍 {notice.title}</p>
          <p className="mt-1">{notice.hint}</p>
        </div>
      )}
      {nativeLive && (
        <p
          data-testid="native-tracking-on"
          className="rounded-2xl bg-emerald-50 px-3.5 py-2.5 text-[11px] font-medium text-emerald-900 ring-1 ring-emerald-300"
        >
          ✅ অ্যাপে ব্যাকগ্রাউন্ড ট্র্যাকিং চালু — স্ক্রিন বন্ধ করলেও কাস্টমার আপনাকে ম্যাপে দেখবেন।
        </p>
      )}
      {showSwitch && (
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-3.5 py-2.5 text-xs text-forest-900">
          <span>
            <span className="font-semibold">ট্রিপে স্ক্রিন জাগিয়ে রাখুন</span>
            <span className="block text-[11px] text-ink-soft">
              {keepAwake ? (awakeHeld ? "চালু — লোকেশন নিরবচ্ছিন্ন যাবে" : "চালু হচ্ছে…") : "বন্ধ — স্ক্রিন ঘুমালে লোকেশন থেমে যেতে পারে"}
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Keep screen on during trips"
            checked={keepAwake}
            onChange={(e) => onKeepAwakeChange(e.target.checked)}
            className="h-5 w-5 accent-forest-800"
          />
        </label>
      )}
    </section>
  );
}
