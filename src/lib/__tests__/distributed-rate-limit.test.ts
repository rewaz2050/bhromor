// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { distributedRateLimit } from "@/lib/distributed-rate-limit";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("distributed API rate limit", () => {
  it("is dormant until the shared Redis credentials are configured", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await distributedRateLimit(new NextRequest("https://shop.test/api/orders"))).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses an atomic shared counter and returns 429 with Retry-After", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.headers).toMatchObject({ Authorization: "Bearer test-token" });
      const command = JSON.parse(String(init.body)) as string[];
      expect(command[0]).toBe("EVAL");
      expect(command[2]).toBe("1");
      expect(command[3]).not.toContain("203.0.113.8");
      expect(command[4]).toBe("60000");
      expect(command[5]).toBe("30");
      return new Response(JSON.stringify({ result: [0, 5000] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const response = await distributedRateLimit(new NextRequest("https://shop.test/api/orders", {
      headers: { "x-real-ip": "203.0.113.8" },
    }));
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBe("5");
  });

  it("normalizes dynamic order IDs so callers cannot rotate through buckets", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    const keys: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      keys.push((JSON.parse(String(init.body)) as string[])[3]!);
      return new Response(JSON.stringify({ result: [1, 30_000] }), { status: 200 });
    }));
    await distributedRateLimit(new NextRequest("https://shop.test/api/vendor/orders/PS-ABC-123"));
    await distributedRateLimit(new NextRequest("https://shop.test/api/vendor/orders/PS-ZZZ-999"));
    expect(keys[0]).toBe(keys[1]);
  });

  it("fails open to the existing route-level fallback if Redis is unavailable", async () => {
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://redis.example.test");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await distributedRateLimit(new NextRequest("https://shop.test/api/orders"))).toBeNull();
  });
});
