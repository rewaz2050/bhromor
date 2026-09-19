"use client";

import { useCallback, useState } from "react";
import { type HomeSettings } from "./home-cms";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiSend } from "./admin-api";
import { publishHomeSettings, useHomeSettings } from "./use-home-settings";

/**
 * Homepage CMS EDITOR (§31) — staff only (`/admin/homepage`).
 *
 * Reads through the same shared store the storefront uses
 * (`useHomeSettings`) and publishes through PATCH /api/admin/homepage.
 * Storefront surfaces must use `useHomeSettings()` directly: this hook
 * pulls in the staff-session probe and the admin API client, which the
 * public bundle should never carry (audit 2026-09-17 P2.2).
 */
export function useCms() {
  const { live: staffLive } = useStaffLive();
  const { settings, loading } = useHomeSettings();
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(
    async (s: HomeSettings): Promise<boolean> => {
      if (!staffLive) return false;
      try {
        const data = await apiSend<{ settings: HomeSettings }>(
          "/api/admin/homepage",
          "PATCH",
          { settings: s },
        );
        publishHomeSettings(data.settings);
        setError(null);
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [staffLive],
  );

  return {
    settings,
    save,
    reset: () => {},
    /** True when the editor publishes to the database (staff session). */
    live: staffLive,
    loading,
    error,
    clearError: () => setError(null),
  };
}
