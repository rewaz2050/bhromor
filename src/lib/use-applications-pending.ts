"use client";

/**
 * Pending shop + rider applications (apply = sign up, 2026-09-26).
 *
 * Polled while the admin tab is visible so a new application shows up as
 * a badge on Shops / Riders and a banner on the dashboard without anyone
 * opening the queues. Live only; zero everywhere else.
 */

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "./admin-api";
import { usePoll } from "./use-poll";
import { useStaffLive } from "./use-staff-live";

export const APPLICATIONS_POLL_MS = 30_000;

export interface ApplicationsPending {
  shops: number;
  riders: number;
}

const NONE: ApplicationsPending = { shops: 0, riders: 0 };

export function useApplicationsPending(): ApplicationsPending & { total: number } {
  const { live } = useStaffLive();
  const [counts, setCounts] = useState<ApplicationsPending>(NONE);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await apiGet<ApplicationsPending>("/api/admin/applications");
      setCounts({
        shops: Number.isFinite(data.shops) ? data.shops : 0,
        riders: Number.isFinite(data.riders) ? data.riders : 0,
      });
    } catch {
      // A failed count only hides the badge; the queues still work.
    }
  }, []);

  useEffect(() => {
    if (!live) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- session change resets live state
      setCounts(NONE);
      return;
    }
    void refresh();
  }, [live, refresh]);

  usePoll(refresh, APPLICATIONS_POLL_MS, live);

  return { ...counts, total: counts.shops + counts.riders };
}
