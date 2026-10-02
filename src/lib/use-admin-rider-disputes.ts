"use client";

/** Admin → Riders → Disputes (item W, 202610020007). Staff-only. */
import { useCallback, useEffect, useState } from "react";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";
import type { AdminDispute } from "./rider-disputes";

export type DisputeTab = "pending" | "decided";

export const useAdminRiderDisputes = (tab: DisputeTab) => {
  const { live, checked } = useStaffLive();
  const [items, setItems] = useState<AdminDispute[]>([]);
  const [ready, setReady] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await apiGet<{ ready: boolean; items: AdminDispute[] }>(`/api/admin/rider-disputes?status=${tab}`);
      setItems(Array.isArray(data.items) ? data.items : []);
      setReady(data.ready !== false);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoaded(true);
    }
  }, [tab]);

  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / tab change
    void refresh();
  }, [live, refresh]);

  /** null on success, else the message to show. */
  const decide = useCallback(
    async (id: string, body: { decision: "approve" | "reject"; amountTaka?: string; note: string }): Promise<string | null> => {
      try {
        await apiSend(`/api/admin/rider-disputes/${encodeURIComponent(id)}`, "POST", body);
        await refresh();
        return null;
      } catch (err) {
        return apiErrorMessage(err);
      }
    },
    [refresh],
  );

  return { live, checked, items, ready, loaded, error, refresh, decide };
};
