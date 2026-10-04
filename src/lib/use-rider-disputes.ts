"use client";

/** The rider's own disputes + raising one (item W, 202610020007). */
import { useCallback, useEffect, useState } from "react";
import { riderErrorMessage, riderFetch } from "./use-rider";
import type { RiderDispute } from "./rider-disputes";

export interface RaiseDisputeForm {
  assignmentId: string | null;
  category: string;
  message: string;
  claimedTaka?: string;
}

export function useRiderDisputes(enabled: boolean) {
  const [items, setItems] = useState<RiderDispute[]>([]);
  const [ready, setReady] = useState(true);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const data = await riderFetch<{ ready: boolean; items: RiderDispute[] }>("/api/rider/disputes");
      setItems(Array.isArray(data.items) ? data.items : []);
      setReady(data.ready !== false);
    } catch {
      /* decoration: the history itself still works */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load
    void refresh();
  }, [enabled, refresh]);

  /** Returns null on success, or the message to show the rider. */
  const raise = useCallback(
    async (form: RaiseDisputeForm): Promise<string | null> => {
      try {
        await riderFetch("/api/rider/disputes", "POST", form);
        await refresh();
        return null;
      } catch (err) {
        return riderErrorMessage(err);
      }
    },
    [refresh],
  );

  return { items, ready, raise, refresh };
}
