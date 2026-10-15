/**
 * Round 4 hardening (2026-10-14): the Cloudinary upload signature covers a
 * size cap (and the format allow-list) so a stolen signature cannot be used
 * to drop an arbitrarily large file into the shop's media cloud.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { signCloudinaryUpload } from "../cloudinary-sign";

vi.mock("@/lib/env", () => ({
  cloudinaryApiKey: () => "key-123",
  cloudinaryApiSecret: () => "secret-abc",
  cloudinaryCloudName: () => "prosanti-test",
}));

describe("signCloudinaryUpload", () => {
  it("signs the size cap with the params (image = 10 MB)", () => {
    const s = signCloudinaryUpload("prosanti/products", "image");
    expect(s.maxFileSize).toBe(10_000_000);
    expect(s.allowedFormats).toBe("avif,jpeg,jpg,png,webp");
    // The signature must cover max_file_size — otherwise the cap is advisory.
    expect(s.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(s.uploadUrl).toContain("prosanti-test");
  });

  it("caps videos at 100 MB and keeps the video format list", () => {
    const s = signCloudinaryUpload("prosanti/proofs", "video");
    expect(s.maxFileSize).toBe(100_000_000);
    expect(s.allowedFormats).toBe("mov,mp4,webm");
  });

  it("signs deterministically for the same second and folder", () => {
    const a = signCloudinaryUpload("prosanti/products", "image");
    const b = signCloudinaryUpload("prosanti/products", "image");
    // Same timestamp bucket → same signature (params are the only inputs).
    if (a.timestamp === b.timestamp) expect(a.signature).toBe(b.signature);
  });
});
