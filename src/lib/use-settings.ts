"use client";

import { useCallback, useEffect, useState } from "react";
import {
  sanitizeSettings,
  SETTINGS_DEFAULTS,
  type AdminSettings,
} from "./settings-store";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

/**
 * Ops settings (§58) — live only. Staff sessions read/write
 * site_settings['ops']; the dashboard + inventory alerts read through here.
 */
export function useSettings() {
  const { live, checked } = useStaffLive();
  const [liveSettings, setLiveSettings] = useState<AdminSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ settings: AdminSettings }>(
        "/api/admin/settings",
      );
      setLiveSettings(data.settings);
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }, []);

  useEffect(() => {
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- session change resets live state
      setLiveSettings(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const save = useCallback(
    async (s: AdminSettings): Promise<boolean> => {
      if (!live) return false;
      try {
        const data = await apiSend<{ settings: AdminSettings }>(
          "/api/admin/settings",
          "PATCH",
          s,
        );
        setLiveSettings(data.settings);
        setError(null);
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [live],
  );

  return {
    settings: liveSettings ?? SETTINGS_DEFAULTS,
    save,
    reset: refresh,
    live,
    loading: live && (!checked || liveSettings === null),
    error,
    clearError: () => setError(null),
  };
}

/* ------------------------------------------------------------------ */
/* Customer surfaces — the same settings, read-only, once per session   */
/* ------------------------------------------------------------------ */

let publicCache: AdminSettings | null = null;
let publicInflight: Promise<AdminSettings> | null = null;

const fetchPublicSettings = (): Promise<AdminSettings> => {
  if (publicCache) return Promise.resolve(publicCache);
  if (!publicInflight) {
    publicInflight = fetch("/api/settings", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`settings ${res.status}`);
        const data = (await res.json()) as { settings: AdminSettings };
        publicCache = sanitizeSettings(data.settings);
        return publicCache;
      })
      .catch(() => SETTINGS_DEFAULTS)
      .finally(() => {
        publicInflight = null;
      });
  }
  return publicInflight;
};

/**
 * Public ops settings for shopper surfaces (checkout quote, the bag's
 * cash-at-the-door card, the arrival cue). Fetches once per page session,
 * serves launch defaults while in flight or when the read fails — the
 * storefront never blocks on it and never invents numbers.
 */
export function usePublicSettings() {
  const [settings, setSettings] = useState<AdminSettings>(
    publicCache ?? SETTINGS_DEFAULTS,
  );
  const [loading, setLoading] = useState(!publicCache);
  useEffect(() => {
    if (publicCache) return;
    let alive = true;
    void fetchPublicSettings().then((next) => {
      if (!alive) return;
      setSettings(next);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { settings, loading };
}
