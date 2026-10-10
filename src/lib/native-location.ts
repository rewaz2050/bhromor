"use client";

/**
 * Native GPS — the one thing a browser cannot do.
 *
 * A web page stops getting fixes when the tab is hidden or the screen sleeps;
 * that is the platform, not a bug, and no amount of wake-lock fixes it. The
 * installed APK can: `@capgo/background-geolocation` runs an Android
 * *foreground service* with a persistent notification, so the rider locks the
 * phone in their pocket and the position keeps flowing.
 *
 * This module is the ONLY place that knows about the native shell. Nothing
 * Capacitor is imported statically — the plugin is `import()`ed only after the
 * bridge says it is running inside the APK, so the storefront's web bundle
 * stays exactly the size it was and a phone browser never downloads native
 * code it cannot use.
 *
 * Every function degrades: no bridge → `{ started: false, reason }`, and the
 * caller falls back to `navigator.geolocation` (see `use-rider-location`).
 *
 * Verified against @capacitor/core 8.5.3 (`CapacitorGlobal.isNativePlatform`,
 * `isPluginAvailable`) and @capgo/background-geolocation 8.4.11
 * (`start(StartOptions, (position?: Location, error?: CallbackError) => void)`,
 * `stop()`, plugin name `'BackgroundGeolocation'`).
 */
import type { GeoErrorKind } from "./location-health";

/** The name the plugin registers itself under. */
export const PLUGIN_NAME = "BackgroundGeolocation";

/** What the rider sees in the persistent Android notification. */
export const BACKGROUND_TITLE = "PROSANTI ডেলিভারি চলছে";
export const BACKGROUND_MESSAGE =
  "রাইডারের লোকেশন পাঠানো হচ্ছে। ডেলিভারি শেষ হলে অ্যাপে ফিরে অফলাইন হোন।";

/**
 * How far the rider must move before the phone reports. Matches
 * `location-throttle.MIN_MOVE_M`: the native layer filters first, so the
 * JavaScript throttle is the second line of defence rather than the first.
 */
export const NATIVE_DISTANCE_FILTER_M = 50;
/** Never more than one fix every few seconds, however fast the bike goes. */
export const NATIVE_MIN_INTERVAL_MS = 5_000;

/** The slice of the Capacitor bridge this app reads. */
interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
}

/** The bridge the APK injects, or null in a plain browser. Never throws. */
export const capacitorBridge = (): CapacitorBridge | null => {
  if (typeof window === "undefined") return null;
  const injected = (window as unknown as { Capacitor?: CapacitorBridge }).Capacitor;
  return injected ?? null;
};

/** True only inside the installed app. */
export const isNativeApp = (): boolean => capacitorBridge()?.isNativePlatform?.() === true;

/**
 * True when background GPS is compiled into THIS build. A rider on an older
 * APK, or the same page opened in Chrome, answers false and keeps the browser
 * path — so shipping the web app and the app side by side cannot break either.
 */
export const nativeGpsAvailable = (): boolean => {
  const bridge = capacitorBridge();
  if (bridge?.isNativePlatform?.() !== true) return false;
  // An older shell without the plugin is not an error, just an old build.
  return bridge.isPluginAvailable?.(PLUGIN_NAME) !== false;
};

/**
 * Plugin error code → the kind the rest of the tracker already understands, so
 * `trackingState` and the rider's notices work identically on both engines.
 */
export const nativeErrorKind = (code: string | null | undefined): GeoErrorKind => {
  const c = (code ?? "").toUpperCase();
  if (c.includes("NOT_AUTHORIZED") || c.includes("PERMISSION")) return "denied";
  if (c.includes("TIMEOUT")) return "timeout";
  return "unavailable";
};

/** The options the native tracker is started with. Pure, so it is testable. */
export const nativeStartOptions = (overrides: {
  distanceFilterM?: number;
  title?: string;
  message?: string;
} = {}) => ({
  backgroundTitle: overrides.title ?? BACKGROUND_TITLE,
  backgroundMessage: overrides.message ?? BACKGROUND_MESSAGE,
  // Ask on the rider's first online tap; Android 13+ then asks for the
  // notification permission on its own.
  requestPermissions: true,
  // A cached fix would put the rider where they were ten minutes ago.
  stale: false,
  distanceFilter: overrides.distanceFilterM ?? NATIVE_DISTANCE_FILTER_M,
  minIntervalMs: NATIVE_MIN_INTERVAL_MS,
});

export type NativeStartResult =
  | { started: true; stop: () => void }
  | { started: false; reason: "not-native" | "no-plugin" | "load-failed" };

/**
 * Start native background tracking. Resolves `{ started: false }` — never
 * throws — when the shell or the plugin is missing, so the caller can fall
 * back to the browser without a try/catch of its own.
 */
export const startNativeGps = async (opts: {
  distanceFilterM?: number;
  onFix: (lat: number, lng: number) => void;
  onError: (kind: GeoErrorKind) => void;
}): Promise<NativeStartResult> => {
  const bridge = capacitorBridge();
  if (bridge?.isNativePlatform?.() !== true) return { started: false, reason: "not-native" };

  try {
    const mod = (await import("@capgo/background-geolocation")) as unknown as {
      BackgroundGeolocation?: {
        start: (
          options: ReturnType<typeof nativeStartOptions>,
          callback: (
            position?: { latitude?: number; longitude?: number } | null,
            error?: { code?: string } | null,
          ) => void,
        ) => Promise<void>;
        stop: () => Promise<void>;
      };
    };
    const plugin = mod.BackgroundGeolocation;
    if (!plugin) return { started: false, reason: "no-plugin" };

    await plugin.start(nativeStartOptions({ distanceFilterM: opts.distanceFilterM }), (position, error) => {
      if (error) {
        opts.onError(nativeErrorKind(error.code));
        return;
      }
      const lat = position?.latitude;
      const lng = position?.longitude;
      if (typeof lat !== "number" || typeof lng !== "number") return;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      opts.onFix(lat, lng);
    });

    return {
      started: true,
      stop: () => {
        // Fire and forget: a stop that fails still tears the JS side down, and
        // Android drops the service when the app process dies anyway.
        void plugin.stop().catch(() => undefined);
      },
    };
  } catch {
    return { started: false, reason: "load-failed" };
  }
};
