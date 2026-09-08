import { describe, expect, it, beforeEach } from "vitest";
import { __resetRateLimits, checkRateLimit } from "../rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => __resetRateLimits());

  it("allows up to the limit, then blocks until the window resets", () => {
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("k", 3, 60_000, now).allowed).toBe(true);
    }
    const blocked = checkRateLimit("k", 3, 60_000, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    // A new window admits traffic again.
    expect(checkRateLimit("k", 3, 60_000, now + 60_001).allowed).toBe(true);
  });

  it("buckets keys independently", () => {
    const now = 1_000_000;
    expect(checkRateLimit("a", 1, 60_000, now).allowed).toBe(true);
    expect(checkRateLimit("a", 1, 60_000, now).allowed).toBe(false);
    expect(checkRateLimit("b", 1, 60_000, now).allowed).toBe(true);
  });
});
