"use client";

/** Admin → Money → Daily reconciliation data (202610010007, audit item U). Staff-only. */
import { useCallback, useEffect, useState } from "react";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet } from "./admin-api";
import { todayDhaka, type MoneyDaily } from "./money-daily";

export const useMoneyDaily = () => {
  const { live, checked } = useStaffLive();
  const [day, setDay] = useState<string>(() => todayDhaka());
  const [report, setReport] = useState<MoneyDaily | null>(null);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await apiGet<{ ready: boolean; report: MoneyDaily | null }>(
        `/api/admin/money/daily?date=${encodeURIComponent(day)}`,
      );
      setReady(data.ready);
      setReport(data.report);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / day change
    void refresh();
  }, [live, refresh]);

  return { live, checked, day, setDay, report, ready, loading, error, refresh };
};
