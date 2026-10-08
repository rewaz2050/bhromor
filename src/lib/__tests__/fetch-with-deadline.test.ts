/**
 * A read that never answers must become an error with a retry, not a
 * spinner that has stopped meaning anything (account loading pass).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FETCH_DEADLINE_MS,
  FetchDeadlineError,
  fetchWithDeadline,
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
