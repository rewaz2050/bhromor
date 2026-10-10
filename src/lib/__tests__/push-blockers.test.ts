/**
 * The three push surfaces (admin/customer, rider, vendor) each word their
 * "why this cannot push" line themselves, and all three of them sniff the user
 * agent. The installed Android app carries Android's stock `; wv)` WebView
 * marker (Capacitor only rewrites the agent when `android.appendUserAgent` /
 * `overrideUserAgentString` is configured, and neither is), so without an
 * explicit native check every one of them told a rider standing inside the
 * shop's own app to "open this in Chrome".
 *
 * These are pure functions over PushEnv, so the guard is asserted directly.
 */

import { describe, expect, it } from "vitest";
import { pushBlocker, type PushEnv } from "../push-client";
import { riderPushBlocker } from "../rider-push-client";
import { vendorPushBlocker } from "../vendor-push-client";

const env = (over: Partial<PushEnv> = {}): PushEnv => ({
  https: true,
  serviceWorker: true,
  pushManager: true,
  notification: true,
  standalone: false,
  platform: "android",
  inApp: null,
  nativeApp: false,
  ...over,
});

describe("push blockers — the installed app is not an in-app browser", () => {
  const surfaces: [string, (e: PushEnv) => string | null][] = [
    ["admin/customer", pushBlocker],
    ["rider", riderPushBlocker],
    ["vendor", vendorPushBlocker],
  ];

  it.each(surfaces)("%s names the app and points at FCM/Chrome", (_name, blocker) => {
    const blocked = blocker(env({ nativeApp: true }));
    expect(blocked).toContain("PROSANTI");
    expect(blocked).not.toContain("in-app browser");
  });

  it("still blames the real in-app browsers once the bridge is gone", () => {
    expect(pushBlocker(env({ inApp: "WhatsApp" }))).toContain("WhatsApp");
    expect(riderPushBlocker(env({ inApp: "WhatsApp" }))).toContain("WhatsApp");
    expect(vendorPushBlocker(env({ inApp: "WhatsApp" }))).toContain("WhatsApp");
  });

  it("the native answer wins even when the WebView marker is also present", () => {
    // readPushEnv() reports both: the app IS an in-app browser by user agent.
    const both = env({ nativeApp: true, inApp: "an in-app browser" });
    expect(pushBlocker(both)).toContain("PROSANTI");
    expect(riderPushBlocker(both)).toContain("PROSANTI");
    expect(vendorPushBlocker(both)).toContain("PROSANTI");
  });

  it("a plain Android Chrome is still unblocked", () => {
    expect(pushBlocker(env())).toBeNull();
    expect(riderPushBlocker(env())).toBeNull();
    expect(vendorPushBlocker(env())).toBeNull();
  });
});
