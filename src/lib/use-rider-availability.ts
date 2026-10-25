"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { offlineCashNote } from "./rider-tasks";

interface AvailabilityOptions {
  ownerKey: string | null;
  online: boolean;
  cashInHand: number;
  setOnline: (online: boolean) => Promise<boolean>;
  refresh: () => Promise<void>;
  sendLocation: (lat: number, lng: number) => Promise<boolean>;
  error: string | null;
  onError: (message: string | null) => void;
}

export function useRiderAvailability(options: AvailabilityOptions) {
  const { ownerKey, online, cashInHand } = options;
  const token = useMemo(() => ({ key: ownerKey }), [ownerKey]);
  const ownerRef = useRef<{
    token: typeof token;
    active: boolean;
    pending: boolean;
    request: number;
    gpsEpoch: number;
    online: boolean;
    cash: number;
    override: boolean | null;
  } | null>(null);
  const empty = {
    token,
    pending: false,
    confirmCash: false,
    override: null as boolean | null,
  };
  const [snapshot, setSnapshot] = useState(empty);
  useEffect(() => {
    const owner = {
      token,
      active: token.key !== null,
      pending: false,
      request: 0,
      gpsEpoch: 0,
      online: false,
      cash: 0,
      override: null as boolean | null,
    };
    ownerRef.current = owner;
    return () => {
      owner.active = false;
      owner.gpsEpoch++;
    };
  }, [token]);
  useEffect(() => {
    const owner = ownerRef.current;
    if (!owner || owner.token !== token) return;
    if (owner.online && !online) owner.gpsEpoch++;
    owner.online = online;
    owner.cash = cashInHand;
  }, [token, online, cashInHand]);
  const view = snapshot.token === token ? snapshot : empty;
  const dismissCash = () => {
    const owner = ownerRef.current;
    if (!owner?.active || owner.token !== token) return;
    setSnapshot((previous) =>
      owner.active && ownerRef.current === owner && owner.token === token
        ? {
            ...(previous.token === token ? previous : empty),
            confirmCash: false,
          }
        : previous,
    );
  };
  const toggle = async (force = false) => {
    const owner = ownerRef.current;
    if (!owner?.active || owner.token !== token || owner.pending) return;
    const current = () =>
      owner.active && ownerRef.current === owner && owner.token === token;
    const publish = (patch: Partial<Omit<typeof empty, "token">>) => {
      if (current())
        setSnapshot((previous) =>
          current()
            ? { ...(previous.token === token ? previous : empty), ...patch }
            : previous,
        );
    };
    const next = !(owner.override ?? owner.online);
    if (!next && !force && offlineCashNote(owner.cash) !== null) {
      publish({ confirmCash: true });
      return;
    }
    owner.pending = true;
    const request = ++owner.request;
    const gpsEpoch = ++owner.gpsEpoch;
    publish({ pending: true, confirmCash: false });
    let acknowledged = false;
    try {
      const ok = await options.setOnline(next);
      if (!current()) return;
      if (!ok) {
        options.onError(options.error);
        return;
      }
      acknowledged = true;
      options.onError(null);
      owner.override = next;
      publish({ override: next });
      await options.refresh();
      if (!current()) return;
      owner.override = null;
      publish({ override: null });
      if (next && navigator.geolocation) {
        let consumed = false;
        try {
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (consumed) return;
              consumed = true;
              if (
                !current() ||
                owner.request !== request ||
                owner.gpsEpoch !== gpsEpoch ||
                !owner.online
              )
                return;
              try {
                void options
                  .sendLocation(
                    position.coords.latitude,
                    position.coords.longitude,
                  )
                  .catch(() => {});
              } catch {
                /* Best-effort location failure remains silent. */
              }
            },
            () => {
              consumed = true;
            },
            { enableHighAccuracy: true, timeout: 8000 },
          );
        } catch {
          /* GPS failure must not turn an acknowledged availability write into a retry. */
        }
      }
    } catch {
      if (current())
        options.onError(
          acknowledged
            ? "অনলাইন অবস্থা যাচাই করা যায়নি — আবার চেষ্টা করুন।"
            : "অনলাইন অবস্থা বদলানো যায়নি — আবার চেষ্টা করুন।",
        );
    } finally {
      owner.pending = false;
      owner.override = null;
      publish({ pending: false, override: null });
    }
  };
  return {
    online: view.override ?? online,
    pending: view.pending,
    confirmCash: view.confirmCash,
    dismissCash,
    toggle,
  };
}
