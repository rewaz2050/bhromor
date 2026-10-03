import { beforeEach, describe, expect, it, vi } from "vitest";
import { __resetRateLimits } from "../rate-limit";
import { __resetDurableRateLimit, checkDurableRateLimit } from "../rate-limit-durable";

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null } | "hang" | "throw";

const svc = (replies: Reply[]) => {
  const calls: Record<string, unknown>[] = [];
  let i = 0;
  return {
    calls,
    service: {
      rpc: (_fn: string, args: Record<string, unknown>) => {
        calls.push(args);
        const r = replies[Math.min(i++, replies.length - 1)];
        if (r === "hang") return new Promise(() => {});
        if (r === "throw") throw new Error("network");
        return Promise.resolve({ data: r.data ?? null, error: r.error ?? null });
      },
    } as never,
  };
};

beforeEach(() => {
  __resetRateLimits();
  __resetDurableRateLimit();
  vi.useRealTimers();
});

describe("checkDurableRateLimit", () => {
  it("asks the shared counter and obeys its verdict (another instance already used the allowance)", async () => {
    const { service, calls } = svc([{ data: [{ allowed: false, retry_after_sec: 42 }] }]);
    const d = await checkDurableRateLimit("login:1.2.3.4", 10, 60_000, { service });
    expect(d).toEqual({ allowed: false, retryAfterSec: 42 });
    expect(calls[0]).toEqual({ p_key: "login:1.2.3.4", p_limit: 10, p_window_ms: 60_000 });
  });

  it("allows when the counter allows", async () => {
    const { service } = svc([{ data: [{ allowed: true, retry_after_sec: 55 }] }]);
    expect((await checkDurableRateLimit("k1", 5, 60_000, { service })).allowed).toBe(true);
  });

  it("the local bucket refuses first — no database round trip for a burst on one instance", async () => {
    const { service, calls } = svc([{ data: [{ allowed: true, retry_after_sec: 5 }] }]);
    for (let i = 0; i < 2; i++) await checkDurableRateLimit("k2", 2, 60_000, { service });
    const third = await checkDurableRateLimit("k2", 2, 60_000, { service });
    expect(third.allowed).toBe(false);
    expect(calls).toHaveLength(2);
  });

  it("fails OPEN to the local verdict when there is no service role", async () => {
    expect((await checkDurableRateLimit("k3", 1, 60_000, { service: null })).allowed).toBe(true);
    expect((await checkDurableRateLimit("k3", 1, 60_000, { service: null })).allowed).toBe(false);
  });

  it("a missing function (migration not run) never blocks, and is not retried for 5 minutes", async () => {
    const { service, calls } = svc([{ error: { code: "42883", message: "function ps_rate_limit_hit does not exist" } }]);
    const t = 1_000_000;
    expect((await checkDurableRateLimit("k4", 5, 60_000, { service, now: t })).allowed).toBe(true);
    await checkDurableRateLimit("k4b", 5, 60_000, { service, now: t + 60_000 });
    expect(calls).toHaveLength(1);
    await checkDurableRateLimit("k4c", 5, 60_000, { service, now: t + 5 * 60_000 + 1 });
    expect(calls).toHaveLength(2);
  });

  it("another database error or a thrown call falls back and pauses for 15 s", async () => {
    const e = svc([{ error: { code: "XX000", message: "boom" } }]);
    const t = 5_000_000;
    expect((await checkDurableRateLimit("k5", 5, 60_000, { service: e.service, now: t })).allowed).toBe(true);
    await checkDurableRateLimit("k5b", 5, 60_000, { service: e.service, now: t + 10_000 });
    expect(e.calls).toHaveLength(1);
    __resetDurableRateLimit();
    const th = svc(["throw"]);
    expect((await checkDurableRateLimit("k6", 5, 60_000, { service: th.service })).allowed).toBe(true);
  });

  it("a hung database is cut off after 1.5 s and the request still proceeds", async () => {
    vi.useFakeTimers();
    const { service } = svc(["hang"]);
    const p = checkDurableRateLimit("k7", 5, 60_000, { service });
    await vi.advanceTimersByTimeAsync(1600);
    expect((await p).allowed).toBe(true);
  });

  it("ignores a malformed reply", async () => {
    const { service } = svc([{ data: [{ nope: 1 }] }]);
    expect((await checkDurableRateLimit("k8", 5, 60_000, { service })).allowed).toBe(true);
  });
});
