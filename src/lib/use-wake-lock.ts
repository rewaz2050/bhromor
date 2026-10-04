"use client";

/**
 * Keeps the screen on while `active` (item Q). A hidden tab or a sleeping
 * screen suspends the phone's GPS, which is what silently killed live tracking
 * on long trips. Browsers also release the lock whenever the page is hidden,
 * so it is re-requested when the rider comes back. Unsupported browsers and
 * refusals (battery saver) just report `held: false`.
 */
import { useCallback, useEffect, useState } from "react";

interface WakeLockSentinelLike {
  release: () => Promise<void>;
  addEventListener: (type: "release", cb: () => void) => void;
}

export const wakeLockSupported = (): boolean =>
  typeof navigator !== "undefined" && "wakeLock" in navigator && typeof (navigator as unknown as { wakeLock?: { request?: unknown } }).wakeLock?.request === "function";

export function useWakeLock(active: boolean): { supported: boolean; held: boolean } {
  const [held, setHeld] = useState(false);
  const supported = wakeLockSupported();

  useEffect(() => {
    if (!active || !wakeLockSupported()) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (sentinel || document.visibilityState !== "visible") return;
      try {
        const lock = await (navigator as unknown as { wakeLock: { request: (t: "screen") => Promise<WakeLockSentinelLike> } }).wakeLock.request("screen");
        if (cancelled) {
          void lock.release().catch(() => {});
          return;
        }
        sentinel = lock;
        setHeld(true);
        lock.addEventListener("release", () => {
          if (sentinel === lock) sentinel = null;
          if (!cancelled) setHeld(false);
        });
      } catch {
        if (!cancelled) setHeld(false);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      const s = sentinel;
      sentinel = null;
      if (s) void s.release().catch(() => {});
      setHeld(false);
    };
  }, [active]);

  return { supported, held: active && held };
}

const KEEP_AWAKE_KEY = "prosanti-rider-keep-awake";

/** The rider's "keep the screen on during trips" switch. On by default; remembered on the device. */
export function useKeepAwakePref(): [boolean, (next: boolean) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      return typeof window === "undefined" ? true : window.localStorage.getItem(KEEP_AWAKE_KEY) !== "off";
    } catch {
      return true;
    }
  });
  const set = useCallback((next: boolean) => {
    setValue(next);
    try {
      window.localStorage.setItem(KEEP_AWAKE_KEY, next ? "on" : "off");
    } catch {
      /* private mode — the choice lasts for this session only */
    }
  }, []);
  return [value, set];
}
