"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type RiderTaskAction = "accept" | "reject" | "pickup";

/** UI/transport ownership for these three board actions, not API authorization. */
export function useRiderTaskActions(ownerKey: string | null) {
  const token = useMemo(() => ({ key: ownerKey }), [ownerKey]);
  const ownerRef = useRef<{
    token: typeof token;
    active: boolean;
    pending: Map<string, RiderTaskAction>;
  } | null>(null);
  const [snapshot, setSnapshot] = useState({ token, pending: new Map<string, RiderTaskAction>() });
  useEffect(() => {
    const owner = { token, active: token.key !== null, pending: new Map<string, RiderTaskAction>() };
    ownerRef.current = owner;
    return () => { owner.active = false; };
  }, [token]);

  const pending: ReadonlyMap<string, RiderTaskAction> = snapshot.token === token ? snapshot.pending : new Map();
  const accepting = [...pending].find(([, action]) => action === "accept")?.[0] ?? null;

  const run = async (
    taskId: string,
    action: RiderTaskAction,
    work: () => Promise<boolean>,
    publish: (ok: boolean, unexpected: boolean) => void,
  ) => {
    const owner = ownerRef.current;
    if (!owner || !owner.active || owner.token !== token || owner.pending.has(taskId)) return;
    // Preserve the board's existing one-accept-at-a-time restriction.
    if (action === "accept" && [...owner.pending.values()].includes("accept")) return;
    owner.pending.set(taskId, action);
    setSnapshot({ token: owner.token, pending: new Map(owner.pending) });
    let ok = false;
    let unexpected = false;
    try {
      ok = await work();
    } catch {
      unexpected = true;
    } finally {
      owner.pending.delete(taskId);
      if (owner.active) setSnapshot({ token: owner.token, pending: new Map(owner.pending) });
    }
    if (owner.active) publish(ok, unexpected);
  };

  return { pending, accepting, run };
}
