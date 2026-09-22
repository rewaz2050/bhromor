"use client";

/**
 * "Phone e notification on korun" — the one-tap setup that lets an order
 * buzz the owner's phone with the panel closed (Web Push + VAPID).
 *
 * States are honest: unsupported browser, server keys missing, permission
 * denied, or live. A test button fires a real push so the owner can see it
 * land before trusting it. iPhone note: Safari only allows web push for
 * sites installed via "Add to Home Screen" (iOS 16.4+).
 */

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend, apiErrorMessage } from "@/lib/admin-api";

interface PushStatus {
  configured: boolean;
  publicKey: string | null;
  count: number;
}

/** URL-safe base64 → the Uint8Array the subscription API demands. */
const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const buffer = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
};

const swSupported = (): boolean =>
  typeof window !== "undefined" &&
  "serviceWorker" in window &&
  "PushManager" in window &&
  "Notification" in window;

export default function PushSetup() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiGet<PushStatus>("/api/admin/push");
      setStatus(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one status fetch on mount
    void load();
  }, [load]);

  const enable = async () => {
    if (busy || !status?.publicKey) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setError("Browser ta permission dey nai — browser settings theke notification allow korte hobe.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(status.publicKey) as BufferSource,
        }));
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      await apiSend("/api/admin/push", "POST", json);
      await load();
      setNote("Phone notification ON — ekhon test button e chap din.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await apiSend("/api/admin/push", "DELETE", { endpoint });
      }
      await load();
      setNote("Phone notification off kora holo.");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await apiSend("/api/admin/push/test", "POST", {});
      setNote("Test pathano holo — phone dekhen (panel closed thakle o asbe).");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (status && !status.configured) {
    return (
      <div
        className="rounded-2xl border border-line bg-paper p-5 text-sm text-ink-soft"
        data-testid="push-setup"
        data-state="unconfigured"
      >
        <p className="font-semibold text-forest-900">Phone notifications</p>
        <p className="mt-1.5 leading-6">
          Server e VAPID keys set kora nai (PUSH_VAPID_PUBLIC_KEY / PUSH_VAPID_PRIVATE_KEY).
          Keys dile ekhane ek tap e notification on hobe — order asle phone sarabe.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-line bg-paper p-5"
      data-testid="push-setup"
      data-state={status === null ? "loading" : "ready"}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-forest-900">Phone notifications</p>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            Order / review / stock alert sarabe panel bondho thakleo.
            {status ? ` Device joma: ${status.count}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status?.count ? (
            <>
              <button
                type="button"
                onClick={() => void sendTest()}
                disabled={busy}
                className="min-h-11 rounded-full bg-forest-800 px-4 text-sm font-semibold text-ivory-50 disabled:opacity-40"
                data-testid="push-test"
              >
                Test pathan
              </button>
              <button
                type="button"
                onClick={() => void disable()}
                disabled={busy}
                className="min-h-11 rounded-full px-4 text-sm font-medium text-ink-soft ring-1 ring-line disabled:opacity-40"
                data-testid="push-disable"
              >
                Off
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => void enable()}
              disabled={busy || !swSupported()}
              className="min-h-11 rounded-full bg-forest-800 px-4 text-sm font-semibold text-ivory-50 disabled:opacity-40"
              data-testid="push-enable"
            >
              {busy ? "Kaj hochchhe…" : "Phone notification ON korun"}
            </button>
          )}
        </div>
      </div>
      {note ? (
        <p role="status" className="mt-3 text-sm text-forest-800" data-testid="push-note">
          {note}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-800">
          {error}
        </p>
      ) : null}
      <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-ink-soft">
        iPhone hole age panel ta &quot;Add to Home Screen&quot; kore nite hobe (iOS 16.4+),
        Android e browser-i notification dekhabe. Panel khola thakle inbox er beep-o bajbe.
      </p>
    </div>
  );
}
