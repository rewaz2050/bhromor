import { describe, expect, it } from "vitest";
import { riderPushBlocker, riderRecoverySteps } from "../rider-push-client";
import type { PushEnv } from "../push-client";

const env = (over: Partial<PushEnv> = {}): PushEnv => ({
  https: true, serviceWorker: true, pushManager: true, notification: true, standalone: false, platform: "android", inApp: null, ...over,
});

describe("rider push — what this phone can do (Bangla)", () => {
  it("a normal Android Chrome can subscribe", () => {
    expect(riderPushBlocker(env())).toBeNull();
  });

  it("names the real blocker", () => {
    expect(riderPushBlocker(env({ https: false }))).toMatch(/https/);
    expect(riderPushBlocker(env({ inApp: "Facebook" }))).toMatch(/Facebook.*Chrome/);
    expect(riderPushBlocker(env({ pushManager: false }))).toMatch(/Chrome/);
  });

  it("iPhone needs Add to Home Screen first, then works", () => {
    expect(riderPushBlocker(env({ platform: "ios", standalone: false }))).toMatch(/Add to Home Screen/);
    expect(riderPushBlocker(env({ platform: "ios", standalone: true }))).toBeNull();
  });

  it("recovery steps only exist for a denied permission, per platform", () => {
    expect(riderRecoverySteps(env(), "default")).toEqual([]);
    expect(riderRecoverySteps(env(), "granted")).toEqual([]);
    expect(riderRecoverySteps(env(), "denied").join(" ")).toMatch(/Chrome/);
    expect(riderRecoverySteps(env({ platform: "ios" }), "denied").join(" ")).toMatch(/Notifications/);
  });
});
