/**
 * POST /api/vendor/media/sign — the shop's own Cloudinary signature.
 *
 * Until 2026-09-27 the vendor product editor asked the STAFF-only
 * /api/media/sign, which answers 403 to a vendor session ("This account is
 * not staff"), so adding a product without a pasted image URL was
 * impossible. This route is vendor-gated and pins the folder to the shop's
 * own namespace; these tests pin both.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  vendor: null as null | { shopId: string; role: "owner" | "staff" },
  cloudinary: true,
}));

vi.mock("@/lib/vendor-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/vendor-auth")>("@/lib/vendor-auth");
  return {
    ...actual,
    requireVendor: async () => {
      if (!state.vendor) throw new actual.VendorAuthError("Please sign in again.", 401);
      return {
        user: { id: "vendor-1", email: "shop@x.com" },
        shopId: state.vendor.shopId,
        role: state.vendor.role,
        db: {},
      };
    },
  };
});

vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return {
    ...actual,
    isCloudinaryConfigured: () => state.cloudinary,
    cloudinaryCloudName: () => "demo-cloud",
    cloudinaryApiKey: () => "key-123",
    cloudinaryApiSecret: () => "secret-xyz",
  };
});

import { POST, VENDOR_DEFAULT_FOLDER } from "../vendor/media/sign/route";

const post = (body?: unknown): Request =>
  new Request("http://localhost/api/vendor/media/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  state.vendor = { shopId: "shop-1", role: "owner" };
  state.cloudinary = true;
});

describe("POST /api/vendor/media/sign", () => {
  it("401s without a vendor session", async () => {
    state.vendor = null;
    expect((await POST(post({ folder: "prosanti/products" }))).status).toBe(401);
  });

  it("503s honestly when Cloudinary is not configured", async () => {
    state.cloudinary = false;
    const res = await POST(post());
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code?: string }).code).toBe("NOT_CONFIGURED");
  });

  it("signs a product-photo upload for the shop's own folder", async () => {
    const res = await POST(post({ folder: "prosanti/products", resource: "image" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cloudName: string;
      folder: string;
      resource: string;
      uploadUrl: string;
      signature: string;
    };
    expect(body.cloudName).toBe("demo-cloud");
    expect(body.folder).toBe("prosanti/products");
    expect(body.resource).toBe("image");
    expect(body.uploadUrl).toContain("/image/upload");
    expect(body.signature).toMatch(/^[a-f0-9]{40}$/);
  });

  it("allows the shop's banner folder and a video resource", async () => {
    const res = await POST(post({ folder: "prosanti/shops", resource: "video" }));
    const body = (await res.json()) as { folder: string; resource: string; uploadUrl: string };
    expect(body.folder).toBe("prosanti/shops");
    expect(body.resource).toBe("video");
    expect(body.uploadUrl).toContain("/video/upload");
  });

  it("never signs the platform's own shelves (homepage/brand)", async () => {
    for (const folder of ["prosanti/homepage", "prosanti/brand", "../etc", "evil"]) {
      const res = await POST(post({ folder }));
      const body = (await res.json()) as { folder: string };
      expect(body.folder).toBe(VENDOR_DEFAULT_FOLDER);
    }
  });
});
