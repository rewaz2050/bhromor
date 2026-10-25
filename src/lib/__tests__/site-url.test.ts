import { beforeEach, vi, afterEach, describe, expect, it } from "vitest";
import { absoluteUrl, siteBaseUrl } from "../site-url";

afterEach(() => { vi.unstubAllEnvs(); });
beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", undefined);
  vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", undefined);
  vi.stubEnv("VERCEL_URL", undefined);
});

describe("site-url", () => {
  it("falls back to the existing public canonical domain", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    expect(siteBaseUrl()).toBe("https://proshanti.rahatahmed.site");
    expect(absoluteUrl("/shop")).toBe("https://proshanti.rahatahmed.site/shop");
  });

  it("prefers NEXT_PUBLIC_SITE_URL and trims a trailing slash", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com/";
    expect(siteBaseUrl()).toBe("https://example.com");
    expect(absoluteUrl("shop")).toBe("https://example.com/shop");
  });

  it("uses the Vercel production URL when the public URL is absent", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "https://prod.example.com";
    process.env.VERCEL_URL = "preview.example.com";
    expect(siteBaseUrl()).toBe("https://prod.example.com");
  });

  it("rejects scheme-less values instead of constructing a relative URL", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    process.env.VERCEL_URL = "preview.example.com";
    expect(siteBaseUrl()).toBe("https://preview.example.com");
  });
});
