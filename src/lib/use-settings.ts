"use client";

import { useCallback, useEffect, useState } from "react";
import { SETTINGS_DEFAULTS, type AdminSettings } from "./settings-store";
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
