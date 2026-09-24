"use client";

/**
 * "Phone e notification on korun" — the one-tap setup that lets an order
 * buzz the owner's phone with the panel closed (Web Push + VAPID).
 *
 * Rebuilt 2026-09-23 after the owner's report *"ami notification on korte
 * partesi na"* (Nothing CMF Phone 2 Pro). The old card showed one button and
 * one sentence, so every failure looked the same. This one is a live
 * checklist of the five things that must be true, each with its own fix:
 *
 *   1. server keys      (VAPID on the host)
 *   2. this browser     (in-app browsers / http can never push)
 *   3. browser permission (denied is sticky → hand-written recovery steps)
 *   4. this device      (a live subscription in THIS browser, not the
 *                        server's device count from someone else's laptop)
 *   5. the server row   (migration 202609210001 applied)
 *
 * Opening the card with permission already granted also **re-saves** the
 * current endpoint (silently, no prompt): a subscription that was rotated,
 * pruned or lost is repaired the next time the owner looks at the inbox.
 * iPhone note: Safari only allows web push for sites installed via "Add to
 * Home Screen" (iOS 16.4+).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiSend, apiErrorMessage } from "@/lib/admin-api";
import {
  currentSubscription,
  pushBlocker,
  readPermission,
  readPushEnv,
  recoverySteps,
  removeThisDevice,
  saveThisDevice,
  startPushSetup,
  type PushEnv,
  type PushStatus,
} from "@/lib/push-client";

interface LocalState {
  env: PushEnv;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
}

const UNKNOWN_ENV: PushEnv = {
  https: true,
  serviceWorker: false,
  pushManager: false,
  notification: false,
  standalone: false,
  platform: "desktop",
  inApp: null,
};

const readLocal = async (): Promise<LocalState> => {
  const env = readPushEnv();
  const permission = readPermission();
  const sub = env.serviceWorker ? await currentSubscription() : null;
  return { env, permission, subscribed: sub !== null };
};

const PERMISSION_LABEL: Record<NotificationPermission | "unsupported", string> = {
  granted: "Allow kora ache",
  default: "Ekhono jiggesh kora hoy nai",
  denied: "Block — site ta ar jiggesh korte parbe na",
  unsupported: "Ei browser e notification nai",
};

export default function PushSetup() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [local, setLocal] = useState<LocalState | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const booted = useRef(false);

  const loadServer = useCallback(async (): Promise<PushStatus | null> => {
    try {
      const data = await apiGet<PushStatus>("/api/admin/push");
      setStatus(data);
      return data;
    } catch (err) {
      setError(apiErrorMessage(err));
      return null;
    }
  }, []);

  const reload = useCallback(async (): Promise<PushStatus | null> => {
    const data = await loadServer();
    setLocal(await readLocal());
    return data;
  }, [loadServer]);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      const data = await reload();
      const localNow = await readLocal();
      // Self-heal: permission is already granted, so subscribing needs no
      // prompt — make sure the server has THIS browser's live endpoint.
      if (data?.configured && data.tableReady !== false && localNow.permission === "granted") {
        if (!localNow.subscribed) {
          const result = await saveThisDevice(data);
          if (result.ok) {
            await reload();
            setNote("Ei phone ta abar jora lagano holo — test pathiye dekhun.");
          }
        }
      }
    })();
  }, [reload]);

  const enable = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const result = await startPushSetup();
      if (result.ok) {
        await reload();
        setNote("Phone notification ON — ekhon test pathiye phone-e dekhun.");
      } else if (result.reason === "dismissed") {
        setError("Permission prompt e “Allow” chapen — na chaaple notification asbe na.");
      } else if (result.reason === "denied") {
        setError("Browser ekbar block kore diyeche, tai site ta ar prompt dekhabe na. Niche theke hand-set korte hobe.");
      } else if (result.reason === "unconfigured") {
        setError("Server e VAPID key nai — upore lekha dhap gulo age korun.");
      } else if (result.reason === "in-app") {
        setError("In-app browser e push kaj kore na — page ta Chrome e kholun.");
      } else {
        setError(result.message ?? "Kaj ta sesh hote parlo na — abar cheshta korun.");
      }
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await removeThisDevice();
      await reload();
      setNote("Ei phone theke notification off kora holo.");
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
      setNote("Test pathano holo — phone dekhen (panel bondho thakle-o asbe).");
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const env = local?.env ?? UNKNOWN_ENV;
  const permission = local?.permission ?? "unsupported";
  const blocker = local ? pushBlocker(env) : null;
  const steps = local ? recoverySteps(env, permission) : [];
  const configured = status?.configured === true;
  const tableReady = status?.tableReady !== false;
  const deviceOnServer = status?.count ?? 0;

  const rows: { key: string; label: string; detail: string; ok: boolean }[] = [
    {
      key: "server",
      label: "Server key (VAPID)",
      detail: configured
        ? "Bosano ache — push pathano jabe."
        : "Nai. Host e PUSH_VAPID_PUBLIC_KEY + PUSH_VAPID_PRIVATE_KEY set koren.",
      ok: configured,
    },
    {
      key: "db",
      label: "Database table",
      detail: tableReady
        ? "push_subscriptions ready."
        : "push_subscriptions table nai — Supabase SQL Editor e supabase/migrations/202609210001_push_subscriptions.sql run korun.",
      ok: tableReady,
    },
    {
      key: "browser",
      label: "Ei browser",
      detail: blocker ?? "Push support ache.",
      ok: local !== null && blocker === null,
    },
    {
      key: "permission",
      label: "Browser permission",
      detail: PERMISSION_LABEL[permission],
      ok: permission === "granted",
    },
    {
      key: "device",
      label: "Ei phone ta",
      detail: local?.subscribed
        ? "Jora lagano ache — panel bondho thakleo notification asbe."
        : "Ekhono jora lagano nai.",
      ok: local?.subscribed === true,
    },
  ];

  if (status && !status.configured) {
    return (
      <div
        className="rounded-2xl border border-line bg-paper p-5 text-sm text-ink-soft"
        data-testid="push-setup"
        data-state="unconfigured"
      >
        <p className="font-semibold text-forest-900">Phone notifications</p>
        <ol className="mt-2 space-y-1.5 leading-6">
          <li>
            <strong>1.</strong> Lokale: <code className="rounded bg-ivory-100 px-1.5 py-0.5 text-xs">npx web-push generate-vapid-keys</code>
          </li>
          <li>
            <strong>2.</strong> Vercel → Settings → Environment Variables:{" "}
            <code className="rounded bg-ivory-100 px-1.5 py-0.5 text-xs">PUSH_VAPID_PUBLIC_KEY</code> +{" "}
            <code className="rounded bg-ivory-100 px-1.5 py-0.5 text-xs">PUSH_VAPID_PRIVATE_KEY</code>
            {" "}(optional <code className="rounded bg-ivory-100 px-1.5 py-0.5 text-xs">PUSH_VAPID_SUBJECT</code> = mailto:)
          </li>
          <li>
            <strong>3.</strong> Redeploy → ei page refresh. Tarpor ON button ta ekhane asbe.
          </li>
        </ol>
        <p className="mt-2 text-xs leading-5 text-ink-soft">
          Key na dile push kichui pathabe na (kichu bhangbe na, shudhu chup thakbe) — ei card ta ekhon
          server-er key khuje pacche na.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl border border-line bg-paper p-5"
      data-testid="push-setup"
      data-state={status === null || local === null ? "loading" : "ready"}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-forest-900">Phone notifications</p>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            Order / review / stock alert phone-e sarabe — panel bondho thakleo.
            {status ? ` Server e joma device: ${status.count}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {permission === "denied" || blocker ? (
            <button
              type="button"
              onClick={() => void enable()}
              disabled={busy || !local}
              className="min-h-11 rounded-full px-4 text-sm font-semibold text-forest-800 ring-1 ring-line disabled:opacity-40"
              data-testid="push-recheck"
            >
              Abari check korun
            </button>
          ) : local?.subscribed ? (
            <>
              <button
                type="button"
                onClick={() => void sendTest()}
                disabled={busy || !configured}
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
              disabled={busy || !local || !configured || !tableReady || blocker !== null}
              className="min-h-11 rounded-full bg-forest-800 px-4 text-sm font-semibold text-ivory-50 disabled:opacity-40"
              data-testid="push-enable"
            >
              {busy ? "Kaj hochchhe…" : "Phone notification ON korun"}
            </button>
          )}
        </div>
      </div>

      {/* Honest checklist — the old card could only say "on" or nothing. */}
      <ul className="mt-4 grid gap-1.5 border-t border-line pt-3" data-testid="push-checks">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex items-start gap-2 text-sm leading-6"
            data-testid={`push-check-${row.key}`}
            data-ok={row.ok ? "1" : "0"}
          >
            <span
              aria-hidden
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold ${
                row.ok ? "bg-forest-100 text-forest-800" : "bg-amber-100 text-amber-800"
              }`}
            >
              {row.ok ? "✓" : "!"}
            </span>
            <span className="text-ink-soft">
              <span className="font-medium text-forest-900">{row.label}:</span> {row.detail}
            </span>
          </li>
        ))}
      </ul>

      {steps.length > 0 && (
        <div
          className="mt-3 rounded-xl bg-amber-50 px-3.5 py-3 text-sm leading-6 text-amber-900 ring-1 ring-amber-200"
          data-testid="push-recovery"
        >
          <p className="font-semibold">
            Browser block kore feleche — ei dhap gulo phone-e korte hobe:
          </p>
          <ol className="mt-1.5 list-decimal space-y-1 pl-4">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <p className="mt-1.5 text-xs leading-5 text-amber-900/90">
            Site “Block” hoye gele site nije theke ar prompt dekhate pare na — tai ei kaj ta hath e korte hoy.
          </p>
        </div>
      )}

      {deviceOnServer > 0 && !local?.subscribed && (
        <p className="mt-3 text-xs leading-5 text-ink-soft" data-testid="push-other-devices">
          Server e {deviceOnServer} ta device joma ache — kintu ei browser ta na. Onno phone/laptop theke
          ON kora thakle ekhane “Ei phone ta” na dekhale ei phone ta ekhono jora lagano nai.
        </p>
      )}

      {note ? (
        <p role="status" className="mt-3 text-sm text-forest-800" data-testid="push-note">
          {note}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-rose-800" data-testid="push-error">
          {error}
        </p>
      ) : null}
      <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-ink-soft">
        iPhone hole age panel ta &quot;Add to Home Screen&quot; kore nite hobe (iOS 16.4+),
        Android e Chrome-i notification dekhabe — kintu Chrome app-er notification permission ON
        thakte hobe (Settings → Apps → Chrome → Notifications), ar battery saver e Chrome
        &quot;Unrestricted&quot; rakhte hobe. Panel khola thakle inbox er beep-o bajbe.
      </p>
    </div>
  );
}
