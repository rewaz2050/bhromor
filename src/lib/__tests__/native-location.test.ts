/**
 * The native GPS bridge. These pin the two things that would silently break
 * the Android app: that a plain browser is NEVER treated as native (so the
 * storefront keeps using navigator.geolocation), and that a missing or old
 * shell degrades instead of throwing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_MESSAGE,
  BACKGROUND_TITLE,
  NATIVE_DISTANCE_FILTER_M,
  NATIVE_MIN_INTERVAL_MS,
  PLUGIN_NAME,
  capacitorBridge,
  isNativeApp,
  nativeErrorKind,
  nativeGpsAvailable,
  nativeStartOptions,
  startNativeGps,
} from "../native-location";

const pluginState = vi.hoisted(() => ({
  startCalls: [] as Record<string, unknown>[],
  stopCalls: 0,
  callback: null as null | ((pos?: unknown, err?: unknown) => void),
  startFails: false,
  missing: false,
}));

vi.mock("@capgo/background-geolocation", () => ({
  BackgroundGeolocation: {
    start: (options: Record<string, unknown>, cb: (pos?: unknown, err?: unknown) => void) => {
      pluginState.startCalls.push(options);
      pluginState.callback = cb;
      return pluginState.startFails ? Promise.reject(new Error("no service")) : Promise.resolve();
    },
    stop: () => {
      pluginState.stopCalls += 1;
      return Promise.resolve();
    },
  },
}));

type Bridge = {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (name: string) => boolean;
};
const withBridge = (bridge: Bridge | undefined) => {
  (window as unknown as { Capacitor?: Bridge }).Capacitor = bridge;
};

beforeEach(() => {
  pluginState.startCalls = [];
  pluginState.stopCalls = 0;
  pluginState.callback = null;
  pluginState.startFails = false;
  pluginState.missing = false;
  withBridge(undefined);
});
afterEach(() => {
  withBridge(undefined);
});

describe("detecting the app", () => {
  it("a plain browser is not native and has no bridge", () => {
    expect(capacitorBridge()).toBeNull();
    expect(isNativeApp()).toBe(false);
    expect(nativeGpsAvailable()).toBe(false);
  });

  it("the installed APK is native", () => {
    withBridge({ isNativePlatform: () => true, isPluginAvailable: () => true });
    expect(isNativeApp()).toBe(true);
    expect(nativeGpsAvailable()).toBe(true);
  });

  it("an old APK without the plugin is native but cannot track in the background", () => {
    withBridge({ isNativePlatform: () => true, isPluginAvailable: () => false });
    expect(isNativeApp()).toBe(true);
    expect(nativeGpsAvailable()).toBe(false);
  });

  it("asks for the plugin by the name it actually registers under", () => {
    expect(PLUGIN_NAME).toBe("BackgroundGeolocation");
    const seen: string[] = [];
    withBridge({
      isNativePlatform: () => true,
      isPluginAvailable: (name: string) => {
        seen.push(name);
        return true;
      },
    });
    nativeGpsAvailable();
    expect(seen).toEqual(["BackgroundGeolocation"]);
  });
});

describe("nativeStartOptions", () => {
  it("asks for permission, refuses stale fixes, and filters at the app's own 50 m", () => {
    const o = nativeStartOptions();
    expect(o).toMatchObject({
      backgroundTitle: BACKGROUND_TITLE,
      backgroundMessage: BACKGROUND_MESSAGE,
      requestPermissions: true,
      stale: false,
      distanceFilter: NATIVE_DISTANCE_FILTER_M,
      minIntervalMs: NATIVE_MIN_INTERVAL_MS,
    });
  });

  it("takes a different filter when the caller asks", () => {
    expect(nativeStartOptions({ distanceFilterM: 25 }).distanceFilter).toBe(25);
  });
});

describe("nativeErrorKind maps onto the tracker's existing vocabulary", () => {
  it.each([
    ["NOT_AUTHORIZED", "denied"],
    ["PERMISSION_DENIED", "denied"],
    ["TIMEOUT", "timeout"],
    ["SERVICE_DISCONNECTED", "unavailable"],
    [undefined, "unavailable"],
    [null, "unavailable"],
  ])("%s → %s", (code, kind) => {
    expect(nativeErrorKind(code as never)).toBe(kind);
  });
});

describe("startNativeGps degrades instead of throwing", () => {
  it("refuses in a plain browser", async () => {
    const result = await startNativeGps({ onFix: vi.fn(), onError: vi.fn() });
    expect(result).toEqual({ started: false, reason: "not-native" });
    expect(pluginState.startCalls).toEqual([]);
  });

  it("reports a load failure rather than breaking the rider's board", async () => {
    withBridge({ isNativePlatform: () => true });
    pluginState.startFails = true;
    const result = await startNativeGps({ onFix: vi.fn(), onError: vi.fn() });
    expect(result).toEqual({ started: false, reason: "load-failed" });
  });
});

describe("startNativeGps inside the app", () => {
  it("starts the service and passes fixes through", async () => {
    withBridge({ isNativePlatform: () => true, isPluginAvailable: () => true });
    const onFix = vi.fn();
    const onError = vi.fn();
    const result = await startNativeGps({ onFix, onError });
    expect(result.started).toBe(true);
    expect(pluginState.startCalls[0]).toMatchObject({ distanceFilter: NATIVE_DISTANCE_FILTER_M });

    pluginState.callback!({ latitude: 25.0703, longitude: 91.4067 });
    expect(onFix).toHaveBeenCalledWith(25.0703, 91.4067);

    // A payload with no usable coordinate is dropped, never sent as 0,0.
    onFix.mockClear();
    pluginState.callback!({});
    pluginState.callback!({ latitude: NaN, longitude: 91.4 });
    expect(onFix).not.toHaveBeenCalled();
  });

  it("turns a permission error into the kind the rider is already told about", async () => {
    withBridge({ isNativePlatform: () => true });
    const onError = vi.fn();
    await startNativeGps({ onFix: vi.fn(), onError });
    pluginState.callback!(undefined, { code: "NOT_AUTHORIZED" });
    expect(onError).toHaveBeenCalledWith("denied");
  });

  it("stop() ends the service", async () => {
    withBridge({ isNativePlatform: () => true });
    const result = await startNativeGps({ onFix: vi.fn(), onError: vi.fn() });
    expect(result.started).toBe(true);
    if (result.started) result.stop();
    expect(pluginState.stopCalls).toBe(1);
  });
});
