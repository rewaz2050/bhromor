/**
 * Live session store — the shared-visibility regression.
 *
 * Login state must live in ONE store that every useCustomer() consumer sees
 * (signup "doing nothing" was per-instance state: the panel's hook and the
 * refresh's hook disagreed). These tests pin the store contract.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetCustomerProbe,
  __resetLiveAuthForTests,
  getAuthSnapshot,
  probeCustomerSession,
  subscribeCustomerAuth,
} from "../customer-session";

const jsonResponse = (body: unknown, status = 200) =>
  Response.json(body, { status });

const fetchMock = vi.fn();
const originalFetch = globalThis.fetch;

beforeEach(() => {
  __resetLiveAuthForTests();
  fetchMock.mockReset();
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("shared live session store", () => {
  it("a signed-in probe publishes the customer to ALL consumers", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ customer: { id: "c1", name: "রহিম", phone: "01712345678" } }),
    );
    let events = 0;
    const unsub = subscribeCustomerAuth(() => {
      events += 1;
    });

    const result = await probeCustomerSession();
    expect(result.mode).toBe("live");

    const snap = getAuthSnapshot();
    expect(snap.checked).toBe(true);
    expect(snap.mode).toBe("live");
    expect(snap.customer?.name).toBe("রহিম");
    expect(events).toBeGreaterThan(0);
    unsub();
  });

  it("401 → signed-in nowhere, but mode live and checked", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ customer: null }, 401));
    await probeCustomerSession();
    expect(getAuthSnapshot()).toMatchObject({
      checked: true,
      mode: "live",
      customer: null,
    });
  });

  it("a later successful login refreshes the SAME store (panel flips)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ customer: null }, 401));
    await probeCustomerSession();
    expect(getAuthSnapshot().customer).toBeNull();

    // refresh(): reset the probe, the API now reports a session.
    __resetCustomerProbe();
    fetchMock.mockResolvedValue(
      jsonResponse({ customer: { id: "c2", name: "করিম", phone: "01812345678" } }),
    );
    await probeCustomerSession();
    expect(getAuthSnapshot().customer?.name).toBe("করিম");
  });

  it("a non-401 body without a customer reads as signed-out (mode stays live)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ strayField: true }));
    await probeCustomerSession();
    const first = getAuthSnapshot();
    expect(getAuthSnapshot()).toBe(first);
    expect(first.mode).toBe("live");
    expect(first.customer).toBeNull();
  });

  it("server snapshot shape matches the un-probed client state (hydration)", async () => {
    // Before any probe the store must look exactly like the server render.
    const snap = getAuthSnapshot();
    expect(snap).toEqual({ checked: false, mode: null, customer: null });
  });
});
