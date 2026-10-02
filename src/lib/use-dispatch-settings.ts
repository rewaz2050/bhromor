"use client";

/** Admin → Riders → Dispatch rules (J, 202610020003). Staff-only. */
import { useCallback, useEffect, useState } from "react";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";
import { DISPATCH_DEFAULTS, sanitizeDispatchSettings, type DispatchSettings } from "./dispatch-settings";

export const useDispatchSettings = () => {
  const { live, checked } = useStaffLive();
  const [settings, setSettings] = useState<DispatchSettings>(DISPATCH_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await apiGet<{ settings: unknown }>("/api/admin/dispatch-settings");
      setSettings(sanitizeDispatchSettings(data.settings));
      setLoaded(true);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount
    void refresh();
  }, [live, refresh]);

  const save = useCallback(async (next: DispatchSettings): Promise<boolean> => {
    try {
      const data = await apiSend<{ settings: unknown }>("/api/admin/dispatch-settings", "PATCH", { settings: next });
      setSettings(sanitizeDispatchSettings(data?.settings ?? next));
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }, []);

  return { live, checked, settings, loaded, error, save, clearError: () => setError(null) };
};
