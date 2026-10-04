"use client";

/** Admin → Riders → Incentives (item V, 202610020010). Staff-only. */
import { useCallback, useEffect, useState } from "react";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";
import { INCENTIVE_DEFAULTS, sanitizeIncentiveSettings, type IncentiveSettings } from "./rider-incentives";

export interface IncentiveForm {
  dailyTarget: string;
  dailyBonusTaka: string;
  referralBonusTaka: string;
  referralAfter: string;
  weeklyTarget: string;
  weeklyBonusTaka: string;
  weeklyTarget2: string;
  weeklyBonus2Taka: string;
}

export const useRiderIncentiveSettings = () => {
  const { live, checked } = useStaffLive();
  const [settings, setSettings] = useState<IncentiveSettings>(INCENTIVE_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await apiGet<{ settings: unknown }>("/api/admin/riders/incentives");
      setSettings(sanitizeIncentiveSettings(data.settings as Partial<IncentiveSettings>));
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

  const save = useCallback(async (form: IncentiveForm): Promise<boolean> => {
    try {
      const data = await apiSend<{ settings: unknown }>("/api/admin/riders/incentives", "PATCH", form);
      setSettings(sanitizeIncentiveSettings(data.settings as Partial<IncentiveSettings>));
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }, []);

  return { live, checked, settings, loaded, error, save, clearError: () => setError(null) };
};
