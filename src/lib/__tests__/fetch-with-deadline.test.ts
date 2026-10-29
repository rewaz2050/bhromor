/**
 * A read that never answers must become an error with a retry, not a
 * spinner that has stopped meaning anything (account loading pass).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FETCH_DEADLINE_MS,
  FetchDeadlineError,
  fetchWithDeadline,
  fetchJsonWithDeadline,
} from "../fetch-with-deadline";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe("fetchWithDeadline", () => {
  it("gives up when the request never answers", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(
      (_url: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    ) as unknown as typeof fetch;

    const pending = fetchWithDeadline("/api/account/orders", {}, 5_000);
    const settled = vi.advanceTimersByTimeAsync(5_000);
    await expect(pending).rejects.toBeInstanceOf(FetchDeadlineError);
    await settled;
  });

  it("passes a quick answer straight through", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(Response.json({ ok: true })),
    ) as unknown as typeof fetch;
    const res = await fetchWithDeadline("/api/account/card", { cache: "no-store" });
    expect(res.status).toBe(200);
  });

  it("does not disguise a real failure as a timeout", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.reject(new TypeError("Failed to fetch")),
    ) as unknown as typeof fetch;
    await expect(fetchWithDeadline("/api/account/me")).rejects.toThrow(
      "Failed to fetch",
    );
  });

  it("waits long enough for a slow phone network", () => {
    expect(FETCH_DEADLINE_MS).toBeGreaterThanOrEqual(10_000);
  });
});


describe("fetchJsonWithDeadline", () => {
  it("bounds a stalled body, not just the arrival of response headers", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    globalThis.fetch = vi.fn(async (_url, init) => {
      signal = init?.signal as AbortSignal;
      return { ok: true, json: () => new Promise(() => {}) } as Response;
    });
    const pending = fetchJsonWithDeadline("/api/products", {}, 1000);
    const assertion = expect(pending).rejects.toBeInstanceOf(FetchDeadlineError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("settles even when a fetch implementation ignores AbortSignal", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {}));
    const pending = fetchJsonWithDeadline("/api/products", {}, 1000);
    const assertion = expect(pending).rejects.toBeInstanceOf(FetchDeadlineError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("preserves fetch options and clears the timer after a quick JSON response", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => Response.json({ value: 7 }));
    globalThis.fetch = fetchMock;
    await expect(fetchJsonWithDeadline("/api/products", { cache: "no-store" })).resolves.toEqual({ value: 7 });
    expect(fetchMock).toHaveBeenCalledWith("/api/products", expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects HTTP errors without accepting the payload as catalog data", async () => {
    globalThis.fetch = vi.fn(async () => Response.json({ products: [] }, { status: 503 }));
    await expect(fetchJsonWithDeadline("/api/products")).rejects.toThrow("503");
  });
});
