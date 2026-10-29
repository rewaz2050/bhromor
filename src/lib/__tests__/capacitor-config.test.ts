import { afterEach, describe, expect, it, vi } from "vitest";

const DEFAULT_SITE = "https://bhromor-zeta.vercel.app";
const loadConfig = async () => (await import("../../../capacitor.config")).default;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Capacitor shell site configuration", () => {
  it.each([undefined, "", "   ", "\t\n"])(
    "uses the documented default for absent or blank MOBILE_SITE_URL (%j)",
    async (value) => {
      vi.stubEnv("MOBILE_SITE_URL", value);
      const config = await loadConfig();
      expect(config.server?.url).toBe(DEFAULT_SITE);
      expect(config.server?.allowNavigation).toEqual([new URL(DEFAULT_SITE).hostname]);
    },
  );

  it("trims an explicit preview override and scopes navigation to its host", async () => {
    vi.stubEnv("MOBILE_SITE_URL", "  https://native-acceptance.invalid  ");
    const config = await loadConfig();
    expect(config.server?.url).toBe("https://native-acceptance.invalid");
    expect(config.server?.allowNavigation).toEqual(["native-acceptance.invalid"]);
  });

  it("preserves the native app identity, offline asset path and GPS bridge policy", async () => {
    vi.stubEnv("MOBILE_SITE_URL", "");
    const config = await loadConfig();
    expect(config.appId).toBe("store.prosanti.rider");
    expect(config.webDir).toBe("mobile-web");
    expect(config.server?.cleartext).toBe(false);
    expect(config.server?.androidScheme).toBe("https");
    expect(config.android?.useLegacyBridge).toBe(true);
  });

  it("does not silently replace a malformed nonblank override with production", async () => {
    vi.stubEnv("MOBILE_SITE_URL", "not-a-url");
    await expect(loadConfig()).rejects.toThrow("Invalid URL");
  });
});
