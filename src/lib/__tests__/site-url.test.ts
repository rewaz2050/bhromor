import { afterEach, describe, expect, it } from "vitest";
import { absoluteUrl, siteBaseUrl } from "../site-url";

const original = {
  site: process.env.NEXT_PUBLIC_SITE_URL,
  production: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  vercel: process.env.VERCEL_URL,
};

afterEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = original.site;
  process.env.VERCEL_PROJECT_PRODUCTION_URL = original.production;
  process.env.VERCEL_URL = original.vercel;
});

describe("site-url", () => {
  it("falls back to the stable prosanti.store domain", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    expect(siteBaseUrl()).toBe("https://prosanti.store");
    expect(absoluteUrl("/shop")).toBe("https://prosanti.store/shop");
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
