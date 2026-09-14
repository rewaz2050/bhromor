/**
 * P1 #10 UGC — review photo gates: shape, count, size, and the honest
 * fallback (Cloudinary configured → re-hosted URL; not configured / failed
 * upload → the compressed data URL is kept, the review is never lost).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const envMock = vi.hoisted(() => ({
  configured: false,
}));

vi.mock("@/lib/env", () => ({
  cloudinaryCloudName: () => (envMock.configured ? "test-cloud" : null),
  cloudinaryApiKey: () => (envMock.configured ? "key" : null),
  cloudinaryApiSecret: () => (envMock.configured ? "secret" : null),
  isCloudinaryConfigured: () => envMock.configured,
}));

import {
  attachReviewPhotos,
  compressReviewPhoto,
  isReviewPhotoDataUrl,
  MAX_PHOTOS,
  sanitizeReviewPhotos,
  storeReviewPhotos,
} from "@/lib/review-photos";

const jpegDataUrl = (payloadLen: number): string =>
  "data:image/jpeg;base64," + "A".repeat(payloadLen);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isReviewPhotoDataUrl", () => {
  it("accepts a jpeg data URL within budget", () => {
    expect(isReviewPhotoDataUrl(jpegDataUrl(1000))).toBe(true);
  });
  it("rejects other mime types, plain URLs, and junk", () => {
    expect(isReviewPhotoDataUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isReviewPhotoDataUrl("https://example.com/a.jpg")).toBe(false);
    expect(isReviewPhotoDataUrl("data:image/jpeg;base64,@@@")).toBe(false);
    expect(isReviewPhotoDataUrl(null)).toBe(false);
  });
});

describe("sanitizeReviewPhotos", () => {
  it("returns [] for non-arrays and junk entries", () => {
    expect(sanitizeReviewPhotos(undefined).dataUrls).toEqual([]);
    expect(sanitizeReviewPhotos("nope").dataUrls).toEqual([]);
    expect(sanitizeReviewPhotos(["data:text/plain;base64,x"]).dataUrls).toEqual([]);
  });
  it("keps valid jpeg data URLs, strips line breaks, caps at 3", () => {
    const { dataUrls } = sanitizeReviewPhotos([
      jpegDataUrl(500).replace(/(.{40})/g, "$1\n"), // line breaks
      jpegDataUrl(600),
      jpegDataUrl(700),
      jpegDataUrl(800), // over the cap → dropped
      "data:image/png;base64,AAAA", // wrong mime → dropped
    ]);
    expect(dataUrls).toHaveLength(MAX_PHOTOS);
    for (const url of dataUrls) expect(url).not.toContain("\n");
    expect(dataUrls[0]).toBe(jpegDataUrl(500));
  });
  it("drops oversized payloads (DB constraint headroom)", () => {
    const { dataUrls } = sanitizeReviewPhotos([jpegDataUrl(2_000_000)]);
    expect(dataUrls).toEqual([]);
  });
});

describe("storeReviewPhotos", () => {
  it("keeps data URLs as-is when Cloudinary is not configured (launch scale)", async () => {
    const urls = [jpegDataUrl(500), jpegDataUrl(600)];
    await expect(storeReviewPhotos(urls)).resolves.toEqual(urls);
  });

  it("re-hosts on Cloudinary when configured and the upload succeeds", async () => {
    envMock.configured = true;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ secure_url: "https://res.cloudinary.com/review-1.jpg" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const [url] = await storeReviewPhotos([jpegDataUrl(500)]);
    expect(url).toBe("https://res.cloudinary.com/review-1.jpg");
    expect(fetchMock).toHaveBeenCalledOnce();
    const body = decodeURIComponent(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toContain("folder=prosanti/reviews");
    expect(body).toContain("data:image/jpeg;base64,");
  });

  it("falls back to the data URL when the Cloudinary upload fails (review never lost)", async () => {
    envMock.configured = true;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const urls = [jpegDataUrl(500)];
    await expect(storeReviewPhotos(urls)).resolves.toEqual(urls);
  });

  it("falls back per-photo when one upload fails but another succeeds", async () => {
    envMock.configured = true;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ secure_url: "https://res.cloudinary.com/a.jpg" }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const [first, second] = await storeReviewPhotos([jpegDataUrl(500), jpegDataUrl(600)]);
    expect(first).toBe("https://res.cloudinary.com/a.jpg");
    expect(second).toBe(jpegDataUrl(600));
  });
});

describe("attachReviewPhotos", () => {
  it("attaches lists by id and defaults to []", () => {
    const map = new Map([["r1", ["https://res.cloudinary.com/a.jpg"]]]);
    const out = attachReviewPhotos([{ id: "r1" }, { id: "r2" }], map);
    expect(out[0].photos).toEqual(["https://res.cloudinary.com/a.jpg"]);
    expect(out[1].photos).toEqual([]);
  });
});

describe("compressReviewPhoto (browser guards)", () => {
  beforeEach(() => {
    // jsdom has no canvas implementation — the guard path is what runs here.
  });
  it("returns null for non-image files instead of encoding garbage", async () => {
    const notImage = new File(["hello"], "a.txt", { type: "text/plain" });
    await expect(compressReviewPhoto(notImage)).resolves.toBeNull();
  });
  it("returns null (not a throw) when canvas decoding fails", async () => {
    const file = new File(["fake"], "a.jpg", { type: "image/jpeg" });
    // jsdom Image never fires onload → promise must reject into null.
    await expect(compressReviewPhoto(file)).resolves.toBeNull();
  });
});
