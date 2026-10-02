"use client";

/** Admin → Riders → Incentives → peak/rain bonus (202610020015). Staff-only. */
import { useCallback, useEffect, useState } from "react";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";
import { ORDER_BONUS_DEFAULTS, sanitizeOrderBonusSettings, type OrderBonusSettings } from "./rider-order-bonus";

export interface OrderBonusForm {
  peakBonusTaka: string;
  peakStartHour: string;
  peakEndHour: string;
  rainBonusTaka: string;
}

export const useRiderOrderBonus = () => {
  const { live, checked } = useStaffLive();
  const [settings, setSettings] = useState<OrderBonusSettings>(ORDER_BONUS_DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await apiGet<{ settings: unknown }>("/api/admin/riders/order-bonus");
      setSettings(sanitizeOrderBonusSettings(data.settings as Partial<OrderBonusSettings>));
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

  const save = useCallback(async (form: OrderBonusForm): Promise<boolean> => {
    try {
      const data = await apiSend<{ settings: unknown }>("/api/admin/riders/order-bonus", "PATCH", form);
      setSettings(sanitizeOrderBonusSettings(data.settings as Partial<OrderBonusSettings>));
      setError(null);
      return true;
    } catch (err) {
      setError(apiErrorMessage(err));
      return false;
    }
  }, []);

  return { live, checked, settings, loaded, error, save, clearError: () => setError(null) };
};
