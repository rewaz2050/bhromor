"use client";

/**
 * Admin delivery-zone data — live only. Zones read/write through
 * /api/admin/zones. Public surfaces (checkout, delivery checker) use
 * useLiveZones() instead — staff endpoints never serve the storefront.
 */

import { useCallback, useEffect, useState } from "react";
import type { DeliveryZone } from "./catalog";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";

export function useZones() {
  const { live, checked } = useStaffLive();
  const [liveZones, setLiveZones] = useState<DeliveryZone[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiGet<{ zones: DeliveryZone[] }>("/api/admin/zones");
      setLiveZones(data.zones);
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
      setLiveZones(null);
      setError(null);
      return;
    }
    void refresh();
  }, [live, refresh]);

  const saveZone = useCallback(
    async (z: DeliveryZone): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend("/api/admin/zones", "POST", z);
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [live, refresh],
  );

  const removeZone = useCallback(
    async (id: string): Promise<boolean> => {
      if (!live) return false;
      try {
        await apiSend(
          `/api/admin/zones/${encodeURIComponent(id)}`,
          "DELETE",
        );
        setError(null);
        await refresh();
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [live, refresh],
  );

  const moveZone = useCallback(
    async (id: string, dir: -1 | 1): Promise<void> => {
      if (!live) return;
      try {
        const data = await apiSend<{ zones: DeliveryZone[] }>(
          "/api/admin/zones",
          "POST",
          { action: "move", id, dir },
        );
        setLiveZones(data.zones);
        setError(null);
      } catch (err) {
        setError(apiErrorMessage(err));
      }
    },
    [live],
  );

  const zones = liveZones ?? [];
  return {
    activeZones: zones.filter((z) => z.active !== false),
    zones,
    saveZone,
    removeZone,
    moveZone,
    reset: refresh,
    live,
    loading: live && (!checked || liveZones === null),
    error,
    clearError: () => setError(null),
  };
}
