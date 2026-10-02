"use client";

/**
 * A new 90-second offer is easy to miss while riding: beep the moment one that
 * was not on the board before appears (in-app alert, not background push — that
 * is `rider-push`). Item Z lifted this out of the page.
 *
 * SOUND ONLY. Vibration belongs to `use-offer-alert`: both hooks used to
 * vibrate on the same event, and the two patterns overwrote each other.
 */
import { useEffect, useRef } from "react";

export const playOfferBeep = (): void => {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.value = 0.12;
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
      window.setTimeout(() => void ctx.close().catch(() => {}), 700);
    }
  } catch {
    /* silent devices stay silent */
  }
};

export function useOfferBeep(offerIds: readonly string[]): void {
  const known = useRef<Set<string>>(new Set());
  useEffect(() => {
    const fresh = offerIds.filter((id) => !known.current.has(id));
    known.current = new Set(offerIds);
    if (fresh.length > 0) playOfferBeep();
  }, [offerIds]);
}
