"use client";

/**
 * The panel's beep (2026-09-27) — one small WebAudio helper shared by every
 * dashboard that has to ring when a new order lands.
 *
 * Mobile Chrome starts every AudioContext "suspended" until the page has had
 * a user gesture (autoplay policy), so a context created on the first new
 * order plays into a suspended graph and the phone stays silent. The fix,
 * learned on the staff panel, is to create/resume the context on the first
 * tap and keep it for the session — this module packages exactly that.
 */

export interface Beep {
  /** Create/resume the context — call from a real user gesture. */
  unlock: () => void;
  /** Ring once. Safe to call with no context (silently does nothing). */
  play: () => void;
}

export const createBeep = (): Beep => {
  let ctx: AudioContext | null = null;

  const ensure = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (ctx) return ctx;
    const AudioCtor =
      window.AudioContext ??
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    try {
      ctx = new AudioCtor();
    } catch {
      ctx = null;
    }
    return ctx;
  };

  const unlock = (): void => {
    const c = ensure();
    if (c && c.state === "suspended") void c.resume().catch(() => {});
  };

  const play = (): void => {
    const c = ensure();
    if (!c) return;
    if (c.state === "suspended") void c.resume().catch(() => {});
    try {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(c.destination);
      gain.gain.setValueAtTime(0.3, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.5);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + 0.5);
    } catch {
      // An audio failure must never break the dashboard.
    }
  };

  return { unlock, play };
};
