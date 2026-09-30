"use client";

/**
 * C1 (2026-09-28) — the shop's staff roster, for /vendor/settings.
 *
 * Client-side fetch only: the browser never imports src/lib/db/*.
 *
 * `enabled` is false for a staff login, which cannot read the roster (the
 * database answers 403 and the policy would refuse the read anyway) — so the
 * card is simply not asked for.
 */

import { useCallback, useEffect, useState } from "react";
import type { VendorStaffMember } from "./vendor-staff";

const call = async (url: string, init?: RequestInit): Promise<Record<string, unknown>> => {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new Error(
      typeof body?.error === "string" ? body.error : "Could not reach the shop — try again.",
    );
  }
  return body ?? {};
};

export function useVendorStaff(enabled: boolean) {
  const [staff, setStaff] = useState<VendorStaffMember[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const body = await call("/api/vendor/staff");
    setStaff((body.staff as VendorStaffMember[] | undefined) ?? []);
    setError(null);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void call("/api/vendor/staff")
      .then((body) => {
        if (cancelled) return;
        setStaff((body.staff as VendorStaffMember[] | undefined) ?? []);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load the roster.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const create = useCallback(
    async (input: {
      name: string;
      login: string;
    }): Promise<{ password: string; staff: VendorStaffMember }> => {
      const body = await call("/api/vendor/staff", {
        method: "POST",
        body: JSON.stringify(input),
      });
      await refresh().catch(() => undefined);
      return {
        password: String(body.password ?? ""),
        staff: body.staff as VendorStaffMember,
      };
    },
    [refresh],
  );

  const revoke = useCallback(
    async (userId: string): Promise<void> => {
      await call(`/api/vendor/staff/${encodeURIComponent(userId)}`, { method: "DELETE" });
      setStaff((prev) => prev.filter((m) => m.userId !== userId));
    },
    [],
  );

  const resetPassword = useCallback(async (userId: string): Promise<string> => {
    const body = await call(`/api/vendor/staff/${encodeURIComponent(userId)}/password`, {
      method: "POST",
    });
    return String(body.password ?? "");
  }, []);

  return { staff, loading, error, create, revoke, resetPassword, refresh };
}
