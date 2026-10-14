import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gateTrackRequest, rejectCrossSite } from "../track-gate";
import { trackTokenFor } from "../track-token";
import { __resetRateLimits } from "../rate-limit";
import { __resetDurableRateLimit } from "../rate-limit-durable";

/**
 * Security 2026-10-14 H3: /api/track* ownership gate. A signed `t` buys the
 * relaxed per-IP budget; the guessable id+phone path stays under the strict
 * one. Cross-site state changes are refused by sec-fetch-site.
 */

const req = (headers: Record<string, string> = {}) =>
  new Request("http://localhost/api/track", { headers });

beforeEach(() => {
  __resetRateLimits();
  __resetDurableRateLimit();
  process.env.TRACK_TOKEN_SECRET = "gate-test-secret";
});

afterEach(() => {
  delete process.env.TRACK_TOKEN_SECRET;
});

describe("rejectCrossSite", () => {
  it("refuses cross-site state changes and allows same-origin/none", () => {
    expect(rejectCrossSite(req({ "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(rejectCrossSite(req({ "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(rejectCrossSite(req({ "sec-fetch-site": "same-site" }))).toBe(false);
    expect(rejectCrossSite(req({ "sec-fetch-site": "none" }))).toBe(false);
    expect(rejectCrossSite(req())).toBe(false);
  });
});

describe("gateTrackRequest", () => {
  it("marks a signed link's token as full proof", async () => {
    const token = trackTokenFor("PS-20260924-0007", "01712345678");
    const gate = await gateTrackRequest(req(), {
      name: "track-test",
      id: "PS-20260924-0007",
      phone: "01712345678",
      token,
      limit: 2,
    });
    expect(gate).toEqual({ allowed: true, tokenOk: true });
  });

  it("keeps the guessable id+phone path on the strict budget", async () => {
    // limit 2/min — a third probe (even with a wrong token) gets 429.
    for (let i = 0; i < 2; i += 1) {
      const gate = await gateTrackRequest(req(), {
        name: "track-strict",
        id: "PS-20260924-0007",
        phone: "01712345678",
        token: "f".repeat(24),
        limit: 2,
      });
      expect(gate.allowed).toBe(true);
      if (gate.allowed) expect(gate.tokenOk).toBe(false);
    }
    const blocked = await gateTrackRequest(req(), {
      name: "track-strict",
      id: "PS-20260924-0007",
      phone: "01712345678",
      token: "f".repeat(24),
      limit: 2,
    });
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) {
      expect(blocked.response.status).toBe(429);
      expect(blocked.response.headers.get("Retry-After")).toBeTruthy();
    }
  });

  it("lets signed-link callers past the strict budget (relaxed 4×, ≥60/min)", async () => {
    const token = trackTokenFor("PS-20260924-0007", "01712345678");
    // Strict limit 2 → token budget max(8, 60) = 60/min: 10 calls all pass.
    for (let i = 0; i < 10; i += 1) {
      const gate = await gateTrackRequest(req(), {
        name: "track-relaxed",
        id: "PS-20260924-0007",
        phone: "01712345678",
        token,
        limit: 2,
      });
      expect(gate.allowed).toBe(true);
    }
  });
});
