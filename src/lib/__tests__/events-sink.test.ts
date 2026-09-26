/**
 * Browser half of the first-party funnel (UX plan §0): events queue, leave
 * in batches, survive tab close via sendBeacon, and never throw.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __queuedEvents,
  __resetEventsSink,
  currentLang,
  flushEvents,
  record,
  sessionId,
} from "@/lib/events-sink";

const fetchMock = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
  localStorage.clear();
  __resetEventsSink();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const lastBody = () => {
  const call = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit] | undefined;
  if (!call) return null;
  return { url: call[0], init: call[1], json: JSON.parse(String(call[1].body)) as { sid: string; events: unknown[] } };
};

describe("sessionId", () => {
  it("mints one per tab and keeps it in sessionStorage", () => {
    const a = sessionId();
    expect(a).toMatch(/^[a-z0-9]{8,64}$/);
    expect(sessionId()).toBe(a);
    expect(sessionStorage.getItem("prosanti.sid.v1")).toBe(a);
    __resetEventsSink();
    expect(sessionId()).toBe(a);
  });
});

describe("record / flushEvents", () => {
  it("queues, then posts one keepalive batch after the flush interval", async () => {
    record({ t: "page_view", p: "/" });
    record({ t: "view_item", pid: "p1", v: 100 });
    expect(__queuedEvents()).toHaveLength(2);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = lastBody()!;
    expect(sent.url).toBe("/api/events");
    expect(sent.init.method).toBe("POST");
    expect(sent.init.keepalive).toBe(true);
    expect(sent.json.sid).toBe(sessionId());
    expect(sent.json.events).toEqual([
      { t: "page_view", p: "/" },
      { t: "view_item", pid: "p1", v: 100 },
    ]);
    expect(__queuedEvents()).toHaveLength(0);
  });

  it("flushes as soon as 25 events are waiting, in chunks of 25", () => {
    for (let i = 0; i < 25; i += 1) record({ t: "scroll_depth", v: 25 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastBody()!.json.events).toHaveLength(25);
    for (let i = 0; i < 3; i += 1) record({ t: "scroll_depth", v: 50 });
    flushEvents();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastBody()!.json.events).toHaveLength(3);
  });

  it("uses sendBeacon on pagehide so the last events of a visit are not lost", () => {
    const beacon = vi.fn(() => true);
    Object.defineProperty(navigator, "sendBeacon", { value: beacon, configurable: true, writable: true });
    record({ t: "add_to_cart", pid: "p1", src: "card", v: 100 });
    window.dispatchEvent(new Event("pagehide"));
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
    const [url, blob] = beacon.mock.calls[0] as unknown as [string, Blob];
    expect(url).toBe("/api/events");
    expect(blob.type).toBe("application/json");
    expect(__queuedEvents()).toHaveLength(0);
  });

  it("never throws when the network is gone", () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("offline")));
    record({ t: "page_view", p: "/" });
    expect(() => flushEvents()).not.toThrow();
  });
});

describe("currentLang", () => {
  it("reads the persisted choice, then <html lang>", () => {
    document.documentElement.lang = "bn";
    expect(currentLang()).toBe("bn");
    localStorage.setItem("prosanti-lang", "en");
    expect(currentLang()).toBe("en");
    localStorage.setItem("prosanti-lang", "xx");
    document.documentElement.lang = "";
    expect(currentLang()).toBeUndefined();
  });
});
