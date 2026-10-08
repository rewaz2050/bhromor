/**
 * The session probe must never be the reason a page hangs — and a slow
 * network must never be mistaken for a sign-out (account loading pass,
 * 2026-10-07).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SESSION_PROBE_TIMEOUT_MS,
  __resetCustomerProbe,
  __resetLiveAuthForTests,
  getAuthSnapshot,
  probeCustomerSession,
  seedCustomerSession,
} from "../customer-session";

const customer = { id: "c9", name: "রহিম সাহেব", phone: "01712345678" };
const originalFetch = globalThis.fetch;

const json = (body: unknown, status = 200) => Response.json(body, { status });

beforeEach(() => {
  __resetLiveAuthForTests();
  __resetCustomerProbe();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("probeCustomerSession", () => {
  it("stops waiting when the request never answers", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    ) as unknown as typeof fetch;

    const pending = probeCustomerSession();
    await vi.advanceTimersByTimeAsync(SESSION_PROBE_TIMEOUT_MS);
    await pending;
    expect(getAuthSnapshot().checked).toBe(true);
  });

  it("keeps a server-proved session when the network fails", async () => {
    seedCustomerSession(customer);
    globalThis.fetch = vi.fn(() => Promise.reject(new Error("offline"))) as unknown as typeof fetch;
    await probeCustomerSession();
    const snap = getAuthSnapshot();
    // A dead connection is not a sign-out: the dashboard must not vanish.
    expect(snap.checked).toBe(true);
    expect(snap.customer?.id).toBe("c9");
  });

  it("lets a real 401 correct a stale seed — an expired session is a sign-out", async () => {
    seedCustomerSession(customer);
    globalThis.fetch = vi.fn(() => Promise.resolve(json({}, 401))) as unknown as typeof fetch;
    await probeCustomerSession();
    const snap = getAuthSnapshot();
    expect(snap.checked).toBe(true);
    expect(snap.customer).toBeNull();
  });

  it("answers once — every consumer on the page shares one request", async () => {
    globalThis.fetch = vi.fn(() => Promise.resolve(json({ customer }))) as unknown as typeof fetch;
    await Promise.all([probeCustomerSession(), probeCustomerSession()]);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
