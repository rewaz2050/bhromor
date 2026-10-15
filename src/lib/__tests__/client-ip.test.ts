import { describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "../rate-limit";

/**
 * Security 2026-10-14 (M1): proxies APPEND the real client IP to
 * x-forwarded-for, so the RIGHTMOST entry is the trustworthy one. The old
 * leftmost read let an attacker spoof a fresh IP per request and walk past
 * every per-IP limit.
 */

const headers = (map: Record<string, string>) => new Headers(map);

describe("clientIpFromHeaders", () => {
  it("takes the rightmost x-forwarded-for entry (the one the proxy appended)", () => {
    expect(
      clientIpFromHeaders(
        headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.2, 198.51.100.7" }),
      ),
    ).toBe("198.51.100.7");
  });

  it("ignores spoofed leading entries", () => {
    const spoofed = "1.2.3.4, 5.6.7.8, 203.0.113.50";
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": spoofed }))).toBe(
      "203.0.113.50",
    );
  });

  it("prefers x-real-ip when the platform sets it", () => {
    expect(
      clientIpFromHeaders(
        headers({ "x-real-ip": "198.51.100.7", "x-forwarded-for": "1.2.3.4" }),
      ),
    ).toBe("198.51.100.7");
  });

  it("handles single entries, blanks, and absence", () => {
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.9" }))).toBe(
      "203.0.113.9",
    );
    expect(
      clientIpFromHeaders(headers({ "x-forwarded-for": "203.0.113.9, , 10.0.0.1" })),
    ).toBe("10.0.0.1");
    expect(clientIpFromHeaders(headers({}))).toBe("unknown");
    expect(clientIpFromHeaders(headers({ "x-forwarded-for": " , " }))).toBe("unknown");
  });
});
