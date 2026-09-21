/**
 * Haptics — a small vibration where a tap lands something that matters
 * (added to bag, order placed, hearted). Android browsers deliver it via
 * navigator.vibrate; iOS Safari ignores the API silently, which is fine —
 * the visual feedback already exists. Never throws, never blocks.
 */

export type HapticPattern = "tap" | "success";

const PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 8,
  success: [12, 40, 18],
};

export const haptic = (pattern: HapticPattern = "tap"): void => {
  if (typeof navigator === "undefined") return;
  const vibrate = (navigator as { vibrate?: (p: number | number[]) => boolean })
    .vibrate;
  if (typeof vibrate !== "function") return;
  try {
    vibrate.call(navigator, PATTERNS[pattern]);
  } catch {
    /* a device that refuses vibration is not our problem */
  }
};
