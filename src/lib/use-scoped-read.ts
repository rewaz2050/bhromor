"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** A read cache belongs to one enabled lifetime and resource key, never a
 * previous enabled lifetime/path. Requests may finish after cleanup; only the latest
 * owner can commit data, errors or completion state. API permissions stay in
 * the caller's existing fetcher. Same-context failures keep last-good data. */
export function useScopedRead<T>(
  key: string | null,
  enabled: boolean,
  read: (key: string) => Promise<T>,
  errorMessage: (error: unknown) => string,
) {
  const active = enabled && key !== null;
  const owner = useRef({ active: false, key, request: 0 });
  const [snapshot, setSnapshot] = useState<{
    key: string | null;
    data: T | null;
    error: string | null;
    loading: boolean;
  }>({ key, data: null, error: null, loading: active });

  useEffect(() => {
    const state = owner.current;
    state.active = active;
    state.key = key;
    state.request++;
    setSnapshot({ key, data: null, error: null, loading: active });
    return () => {
      state.active = false;
      state.request++;
    };
  }, [active, key]);

  const load = useCallback(
    async (quiet = false): Promise<boolean> => {
      const state = owner.current;
      if (!active || !state.active || key === null || state.key !== key)
        return false;
      const request = ++state.request;
      const current = () =>
        state.active && state.key === key && state.request === request;
      if (!quiet)
        setSnapshot((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const data = await read(key);
        if (!current()) return false;
        setSnapshot({ key, data, error: null, loading: false });
        return true;
      } catch (error) {
        if (!current()) return false;
        setSnapshot((prev) => ({
          ...prev,
          error: errorMessage(error),
          loading: false,
        }));
        return false;
      }
    },
    [active, key, read, errorMessage],
  );

  useEffect(() => {
    void load();
  }, [load]);
  const refresh = useCallback(() => load(), [load]);
  const reload = useCallback(() => load(true), [load]);
  const current = active && snapshot.key === key;
  return {
    data: current ? snapshot.data : null,
    error: current ? snapshot.error : null,
    loading: active && (!current || snapshot.loading),
    refresh,
    reload,
  };
}
