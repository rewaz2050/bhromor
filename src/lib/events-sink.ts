/**
 * First-party event sink (UX plan §0, 2026-09-26) — the browser half.
 *
 * `record(event)` queues; a batch leaves every few seconds, when the queue
 * fills, and on `pagehide` (sendBeacon, so the last events of a visit are
 * not lost). Failures are dropped silently — analytics must never slow the
 * shop or throw. Nothing here runs on the server.
 *
 * Session = one browser tab (sessionStorage): a random id minted on first
 * use, which is what "bounce" and "pages per session" count against.
 */

import {
  MAX_BATCH_EVENTS,
  type WireBatch,
  type WireEvent,
} from "./funnel-events";

const SESSION_KEY = "prosanti.sid.v1";
const ENDPOINT = "/api/events";
const FLUSH_MS = 4000;

let queue: WireEvent[] = [];
let timer: number | null = null;
let installed = false;
let sidCache: string | null = null;

const randomId = (): string => {
  try {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`.toLowerCase();
  }
};

/** The anonymous per-tab session id (minted on first use). */
export const sessionId = (): string => {
  if (sidCache) return sidCache;
  let sid: string | null = null;
  try {
    sid = window.sessionStorage.getItem(SESSION_KEY);
    if (!sid || !/^[a-z0-9]{8,64}$/.test(sid)) {
      sid = randomId();
      window.sessionStorage.setItem(SESSION_KEY, sid);
    }
  } catch {
    sid = sid ?? randomId();
  }
  sidCache = sid;
  return sid;
};

const send = (batch: WireBatch, unload: boolean): void => {
  const body = JSON.stringify(batch);
  try {
    if (unload && typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "application/json" }));
      if (ok) return;
    }
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {
      /* dropped on purpose */
    });
  } catch {
    /* dropped on purpose */
  }
};

/** Push whatever is queued to the server now. */
export const flushEvents = (unload = false): void => {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0) return;
  const events = queue;
  queue = [];
  for (let i = 0; i < events.length; i += MAX_BATCH_EVENTS) {
    send({ sid: sessionId(), events: events.slice(i, i + MAX_BATCH_EVENTS) }, unload);
  }
};

const install = (): void => {
  if (installed) return;
  installed = true;
  window.addEventListener("pagehide", () => flushEvents(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushEvents(true);
  });
};

/** Queue one event. Safe to call anywhere; a no-op on the server. */
export const record = (event: WireEvent): void => {
  if (typeof window === "undefined") return;
  try {
    install();
    queue.push(event);
    if (queue.length >= MAX_BATCH_EVENTS) {
      flushEvents(false);
      return;
    }
    if (timer === null) {
      timer = window.setTimeout(() => flushEvents(false), FLUSH_MS);
    }
  } catch {
    /* never let analytics break the shop */
  }
};

/** The current language, for the `lang` column (reads the persisted choice). */
export const currentLang = (): "en" | "bn" | undefined => {
  try {
    const stored = window.localStorage.getItem("prosanti-lang");
    if (stored === "en" || stored === "bn") return stored;
    const html = document.documentElement.lang;
    return html === "bn" || html === "en" ? html : undefined;
  } catch {
    return undefined;
  }
};

/** Test hook — drop anything queued and forget the session. */
export const __resetEventsSink = (): void => {
  queue = [];
  if (timer !== null && typeof window !== "undefined") window.clearTimeout(timer);
  timer = null;
  sidCache = null;
};

/** Test hook — what is waiting to be sent. */
export const __queuedEvents = (): readonly WireEvent[] => queue;
