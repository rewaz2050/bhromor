"use client";

/** Admin → Riders → Feedback (item X, 202610020009). Staff-only. */
import { useCallback, useEffect, useState } from "react";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet, apiSend } from "./admin-api";
import type { StaffFeedbackRow } from "./delivery-feedback";

export type FeedbackFilter = "all" | "low" | "words";

const queryFor = (f: FeedbackFilter): string =>
  f === "low" ? "?max=2" : f === "words" ? "?only=1" : "";

export const useRiderFeedback = () => {
  const { live, checked } = useStaffLive();
  const [filter, setFilter] = useState<FeedbackFilter>("low");
  const [items, setItems] = useState<StaffFeedbackRow[]>([]);
  const [ready, setReady] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await apiGet<{ ready: boolean; items: StaffFeedbackRow[] }>(`/api/admin/rider-feedback${queryFor(filter)}`);
      setItems(Array.isArray(data.items) ? data.items : []);
      setReady(data.ready !== false);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoaded(true);
    }
  }, [filter]);

  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / filter change
    void refresh();
  }, [live, refresh]);

  const setHidden = useCallback(async (orderId: string, hidden: boolean): Promise<string | null> => {
    try {
      await apiSend(`/api/admin/rider-feedback/${encodeURIComponent(orderId)}`, "PATCH", { hidden });
      setItems((cur) => cur.map((r) => (r.orderId === orderId ? { ...r, hidden } : r)));
      return null;
    } catch (err) {
      return apiErrorMessage(err);
    }
  }, []);

  return { live, checked, filter, setFilter, items, ready, loaded, error, refresh, setHidden };
};
