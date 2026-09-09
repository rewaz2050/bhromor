"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import {
  getCms,
  getCmsServer,
  HOME_DEFAULTS,
  resetCms,
  saveCms,
  subscribeCms,
  type HomeSettings,
} from "./home-cms";
import { sanitizeHomeSettings } from "./engagement";
import { isSupabaseConfigured } from "./env";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiSend } from "./admin-api";

/**
 * Homepage CMS (§31) with live cutover.
 *
 * - Demo mode (no Supabase): the browser-local store, exactly as before.
 * - Live mode: everyone (storefront included) reads the published row
 *   from GET /api/homepage; staff publish through PATCH /api/admin/homepage.
 *   A stale demo overlay never shadows the published row in live mode.
 */
export function useCms() {
  const demo = useSyncExternalStore(subscribeCms, getCms, getCmsServer);
  const { live: staffLive } = useStaffLive();
  const configured = isSupabaseConfigured();
  const [published, setPublished] = useState<HomeSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!configured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mode switch resets live state
      setPublished(null);
      setError(null);
      return;
    }
    let cancelled = false;
    void fetch("/api/homepage", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("CMS unavailable");
        const data = (await res.json()) as {
          settings?: HomeSettings;
          demoMode?: boolean;
        };
        if (!cancelled) {
          setPublished(
            data.demoMode || !data.settings
              ? HOME_DEFAULTS
              : sanitizeHomeSettings(data.settings),
          );
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setPublished(HOME_DEFAULTS);
      });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  const save = useCallback(
    async (s: HomeSettings): Promise<boolean> => {
      if (!staffLive) {
        saveCms(s);
        return true;
      }
      try {
        const data = await apiSend<{ settings: HomeSettings }>(
          "/api/admin/homepage",
          "PATCH",
          { settings: s },
        );
        setPublished(sanitizeHomeSettings(data.settings));
        setError(null);
        return true;
      } catch (err) {
        setError(apiErrorMessage(err));
        return false;
      }
    },
    [staffLive],
  );

  const reset = useCallback(() => {
    // Live rows are staff data — "reset" only ever clears the demo overlay.
    resetCms();
  }, []);

  return {
    settings: configured ? (published ?? HOME_DEFAULTS) : demo,
    save,
    reset,
    /** True when the editor publishes to the database (staff session). */
    live: staffLive,
    loading: configured && published === null,
    error,
    clearError: () => setError(null),
  };
}
