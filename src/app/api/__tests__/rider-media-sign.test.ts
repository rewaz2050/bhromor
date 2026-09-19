/**
 * POST /api/rider/media/sign — the rider's delivery-proof photo signature.
 *
 * Until 2026-09-16 the rider app asked the staff-only /api/media/sign, which
 * refuses a rider session (403), so every proof upload died with a
 * misleading "Cloudinary is not configured". This route is rider-gated and
 * pins the folder; these tests pin both.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  rider: null as null | { id: string; status: string },
  cloudinary: true,
}));

vi.mock("@/lib/rider-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rider-auth")>("@/lib/rider-auth");
  return {
    ...actual,
    requireRider: async () => {
      if (!state.rider) throw new actual.RiderAuthError("Please sign in again.", 401);
      return {
        user: { id: "user-1", email: "r@x.com" },
        rider: state.rider,
        db: {},
        service: {},
        email: "r@x.com",
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

import { POST, PROOF_FOLDER } from "../rider/media/sign/route";

const post = (): Request =>
  new Request("http://localhost/api/rider/media/sign", { method: "POST" });

beforeEach(() => {
  state.rider = { id: "rider-1", status: "active" };
  state.cloudinary = true;
});

describe("POST /api/rider/media/sign", () => {
  it("401s without a rider session", async () => {
    state.rider = null;
    expect((await POST(post())).status).toBe(401);
  });

  it("503s honestly when Cloudinary is not configured", async () => {
    state.cloudinary = false;
    const res = await POST(post());
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code?: string }).code).toBe("NOT_CONFIGURED");
  });

  it("signs an image upload into the delivery-proofs folder for an active rider", async () => {
    const res = await POST(post());
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      cloudName: string;
      apiKey: string;
      folder: string;
      signature: string;
      timestamp: number;
      uploadUrl: string;
    };
    expect(body.cloudName).toBe("demo-cloud");
    expect(body.apiKey).toBe("key-123");
    expect(body.folder).toBe(PROOF_FOLDER);
    expect(body.folder).toBe("prosanti/delivery-proofs");
    expect(body.uploadUrl).toBe("https://api.cloudinary.com/v1_1/demo-cloud/image/upload");
    expect(body.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof body.timestamp).toBe("number");
    // The secret never appears in the response.
    expect(JSON.stringify(body)).not.toContain("secret-xyz");
  });
});
