// @vitest-environment node
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { signCloudinaryUpload } from "@/lib/cloudinary-sign";

afterEach(() => vi.unstubAllEnvs());

describe("Cloudinary signed upload constraints", () => {
  it("cryptographically binds vendor folder, timestamp and image allowlist", () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo");
    vi.stubEnv("CLOUDINARY_API_KEY", "key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "secret");
    const signed = signCloudinaryUpload("prosanti/vendors/shop-id/products", "image");
    const canonical = `allowed_formats=${signed.allowedFormats}&folder=${signed.folder}&timestamp=${signed.timestamp}secret`;
    expect(signed.allowedFormats).toBe("avif,jpeg,jpg,png,webp");
    expect(signed.signature).toBe(createHash("sha1").update(canonical).digest("hex"));
  });

  it("uses the video-only allowlist for video signatures", () => {
    vi.stubEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "demo");
    vi.stubEnv("CLOUDINARY_API_KEY", "key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "secret");
    expect(signCloudinaryUpload("prosanti/vendors/shop-id/products", "video").allowedFormats).toBe("mov,mp4,webm");
  });
});
