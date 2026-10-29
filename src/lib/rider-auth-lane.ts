"use client";

interface Lane {
  tail: Promise<void>;
  revision: number;
}
const lanes = new WeakMap<object, Lane>();

/** Participating browser auth mutations use one lane per SDK client.
 * Web Locks additionally serialize participating tabs on the same origin.
 * Running SDK requests cannot be aborted. Logout remains queued even if its
 * initiating view unmounts; stale queued logins must not change credentials.
 */
export function runRiderAuthMutation<T>(
  client: object,
  current: () => boolean,
  operation: (isCurrent: () => boolean) => Promise<T>,
  logout = false,
): Promise<{ accepted: false } | { accepted: true; value: T }> {
  let lane = lanes.get(client);
  if (!lane) {
    lane = { tail: Promise.resolve(), revision: 0 };
    lanes.set(client, lane);
  }
  const owner = lane;
  const revision = ++owner.revision;
  const valid = () => current() && owner.revision === revision;
  const execute = async () => {
    if (!logout && !valid()) return { accepted: false } as const;
    const value = await operation(valid);
    return valid()
      ? ({ accepted: true, value } as const)
      : ({ accepted: false } as const);
  };
  const task = owner.tail.then(async () => {
    const locks =
      typeof navigator !== "undefined" ? navigator.locks : undefined;
    // Do not fall back to overlapping SDK work if an available lock rejects.
    return locks
      ? await locks.request("bhromor:browser-auth", { mode: "exclusive" }, execute)
      : await execute();
  });
  // A refused/rejected operation must not poison subsequent logout/login.
  owner.tail = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

/** Generic name; the original export remains compatible with rider callers. */
export const runBrowserAuthMutation = runRiderAuthMutation;
