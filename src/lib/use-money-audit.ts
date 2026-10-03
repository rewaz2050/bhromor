"use client";

/** Admin → Money → Audit trail data (202610010006, audit item T). Staff-only. */
import { useCallback, useEffect, useState } from "react";
import { useStaffLive } from "./use-staff-live";
import { apiErrorMessage, apiGet } from "./admin-api";
import type { AuditEvent, MoneyAuditEntry } from "./money-audit";

export const useMoneyAudit = () => {
  const { live, checked } = useStaffLive();
  const [event, setEvent] = useState<AuditEvent | "all">("all");
  const [entries, setEntries] = useState<MoneyAuditEntry[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const data = await apiGet<{ ready: boolean; entries: MoneyAuditEntry[] }>(
        `/api/admin/money/audit?limit=100${event === "all" ? "" : `&event=${event}`}`,
      );
      setReady(data.ready);
      setEntries(data.entries);
      setError(null);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [event]);

  useEffect(() => {
    if (!live) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount / filter change
    void refresh();
  }, [live, refresh]);

  return { live, checked, event, setEvent, entries, ready, loading, error, refresh };
};
