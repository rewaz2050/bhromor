"use client";

/**
 * The shopper's side of order notifications (2026-09-24).
 *
 * One browser, one remembered subscription: `/track` offers "খবর ফোনে নিন",
 * the shopper taps once, and this hook does the work — ask permission (only
 * from that tap), subscribe through the existing `/sw.js`, save the endpoint
 * against the order's phone, and remember it locally so the card reads
 * "on" on the next visit.
 *
 * Why the endpoint is remembered per browser (`prosanti.order-push.v1`) and
 * not re-derived on every load: `getSubscription()` is async and a
 * subscription can exist without ever having been saved server-side (the
 * save failed, the migration was missing). The card must tell those apart —
 * it shows the saving state and heals on the next tap, exactly like the staff
 * card does.
 *
 * Honesty rules (same as the staff setup card):
 *   • an in-app browser (WhatsApp/Facebook WebView) can never subscribe —
 *     say so instead of failing silently;
 *   • a sticky "denied" is not re-promptable — hand over the steps;
 *   • http origins have no Web Push;
 *   • nothing is claimed until the server has actually stored the endpoint.
 */

import { useCallback, useEffect, useState } from "react";
import {
  currentSubscription,
  ensurePermission,
  readPermission,
  readPushEnv,
  pushBlocker,
  recoverySteps,
  urlBase64ToUint8Array,
} from "./push-client";
import { apiErrorMessage } from "./admin-api";

export const ORDER_PUSH_KEY = "prosanti.order-push.v1";

export interface OrderPushCardState {
  /** The browser can push at all (https, real browser, SW + PushManager). */
  supported: boolean;
  blocker: string | null;
  permission: NotificationPermission | "unsupported";
  /** This browser holds a subscription (live, not just remembered). */
  subscribed: boolean;
  /** Fix-it steps for a sticky "denied". */
  steps: string[];
  configured: boolean;
  ready: boolean;
  /**
   * The endpoint this browser remembered for THIS order (localStorage). When
   * it exists but `subscribed` is false, the subscription was rotated or
   * cleared by the browser — the card's next tap re-registers it.
   */
  remembered: boolean;
  /** True while the first status read is still running. */
  loading: boolean;
}

interface ServerStatus {
  configured: boolean;
  publicKey: string | null;
  ready: boolean;
  watching: number;
}

const readRemembered = (): { endpoint: string; orderId: string } | null => {
  try {
    const raw = window.localStorage.getItem(ORDER_PUSH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { endpoint?: unknown; orderId?: unknown };
    if (typeof parsed?.endpoint !== "string") return null;
    return {
      endpoint: parsed.endpoint,
      orderId: typeof parsed.orderId === "string" ? parsed.orderId : "",
    };
  } catch {
    return null;
  }
};

const remember = (endpoint: string, orderId: string): void => {
  try {
    window.localStorage.setItem(ORDER_PUSH_KEY, JSON.stringify({ endpoint, orderId }));
  } catch {
    // Private mode: the subscription still works, the card just forgets.
  }
};

export interface UseOrderPush {
  state: OrderPushCardState;
  /** Turn notifications on for this order's phone. Runs from a tap. */
  enable: () => Promise<{ ok: boolean; message?: string }>;
  /** Stop them on this device. */
  disable: () => Promise<void>;
  /** Fire a real push (server → push service → this phone). */
  sendTest: () => Promise<{ ok: boolean; message?: string }>;
  /** Re-read everything (used after the shopper returns to the tab). */
  refresh: () => Promise<void>;
}

/**
 * `orderId` + `phone` are the tracker's own proof and are sent to the server
 * when subscribing — so the subscription is bound to the number that placed
 * the order, never to whatever a visitor typed into the URL bar.
 */
export function useOrderPush(orderId: string, phone: string): UseOrderPush {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [envReady, setEnvReady] = useState(false);
  const [env, setEnv] = useState(() => readPushEnv());
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    readPermission(),
  );
  const [subscribed, setSubscribed] = useState(false);
  const [remembered, setRemembered] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const nextEnv = readPushEnv();
    setEnv(nextEnv);
    setEnvReady(true);
    setPermission(readPermission());
    setSubscribed(
      nextEnv.serviceWorker ? (await currentSubscription()) !== null : false,
    );
    const saved = readRemembered();
    setRemembered(saved !== null && (orderId === "" || saved.orderId === orderId));
    try {
      const res = await fetch("/api/track/push", { cache: "no-store" });
      if (res.ok) setStatus((await res.json()) as ServerStatus);
    } catch {
      // Offline or unconfigured backend: the card stays honest about `supported`.
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- one status read on mount
  useEffect(() => void refresh(), [refresh]);

  const enable = useCallback(async () => {
    const permissionNow = await ensurePermission();
    setPermission(permissionNow);
    if (permissionNow === "unsupported") {
      return { ok: false, message: "Ei browser e notification support nai." };
    }
    if (permissionNow === "denied") {
      return {
        ok: false,
        message: "Browser block kore diyeche — nicher steps follow korun.",
      };
    }
    if (permissionNow !== "granted") {
      return { ok: false, message: "“Allow” chapen — na chaaple khobor asbe na." };
    }
    const server = status ?? ((await (await fetch("/api/track/push")).json()) as ServerStatus);
    if (!server.configured || !server.publicKey) {
      return { ok: false, message: "Dokaner server e push key set kora nai." };
    }
    try {
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const key = urlBase64ToUint8Array(server.publicKey);
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const res = await fetch("/api/track/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          ...json,
          id: orderId,
          phone,
          lang: document.documentElement.lang === "en" ? "en" : "bn",
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        return { ok: false, message: data?.error ?? "Save kora gelo na — abar cheshta korun." };
      }
      if (json.endpoint) remember(json.endpoint, orderId);
      setSubscribed(true);
      await refresh();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: apiErrorMessage(err) };
    }
  }, [orderId, phone, refresh, status]);

  const disable = useCallback(async () => {
    const sub = await currentSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      try {
        await sub.unsubscribe();
      } catch {
        // The server row goes either way — this device is off.
      }
      try {
        await fetch("/api/track/push", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      } catch {
        // best effort
      }
    }
    try {
      window.localStorage.removeItem(ORDER_PUSH_KEY);
    } catch {
      // nothing to forget
    }
    setSubscribed(false);
  }, []);

  const sendTest = useCallback(async () => {
    // A real send: server → push service → this phone. A local notification
    // would prove nothing about the pipeline the order updates use.
    try {
      const res = await fetch("/api/track/push/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, phone }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        return { ok: false, message: data?.error ?? "Test pathano gelo na." };
      }
      const data = (await res.json()) as { sent?: number };
      return data.sent && data.sent > 0
        ? { ok: true }
        : { ok: false, message: "Ei device ta server e joma nai — ON korun, tarpor test." };
    } catch (err) {
      return { ok: false, message: apiErrorMessage(err) };
    }
  }, [orderId, phone]);

  const blocker = envReady ? pushBlocker(env) : null;
  const steps = envReady ? recoverySteps(env, permission) : [];

  return {
    state: {
      supported: envReady && blocker === null,
      blocker,
      permission,
      subscribed,
      remembered,
      steps,
      configured: status?.configured === true,
      ready: status?.ready !== false,
      loading,
    },
    enable,
    disable,
    sendTest,
    refresh,
  };
}
