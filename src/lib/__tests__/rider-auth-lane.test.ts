import { expect, it, vi } from "vitest";
import { runRiderAuthMutation as run } from "../rider-auth-lane";
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
it("logout waits for running SDK login and suppresses its accepted result", async () => {
  const client = {},
    pending = deferred(),
    events: string[] = [];
  const login = run(
    client,
    () => true,
    async () => {
      events.push("login");
      await pending.promise;
    },
  );
  await Promise.resolve();
  const logout = run(
    client,
    () => true,
    async () => {
      events.push("logout");
    },
    true,
  );
  expect(events).toEqual(["login"]);
  pending.resolve();
  expect((await login).accepted).toBe(false);
  await logout;
  expect(events).toEqual(["login", "logout"]);
});
it("queued abandoned login does not dispatch", async () => {
  const client = {},
    pending = deferred(),
    sdk = vi.fn(async () => {});
  let active = true;
  const first = run(
    client,
    () => true,
    () => pending.promise,
    true,
  );
  const second = run(client, () => active, sdk);
  active = false;
  pending.resolve();
  await first;
  await second;
  expect(sdk).not.toHaveBeenCalled();
});
it("queued superseded login skips SDK, newest login runs after logout", async () => {
  const client = {},
    pending = deferred(),
    stale = vi.fn(async () => {}),
    fresh = vi.fn(async () => {});
  const out = run(
    client,
    () => true,
    () => pending.promise,
    true,
  );
  const a = run(client, () => true, stale),
    b = run(client, () => true, fresh);
  pending.resolve();
  await out;
  await a;
  await b;
  expect(stale).not.toHaveBeenCalled();
  expect(fresh).toHaveBeenCalledTimes(1);
});
it("logout intent survives originating view unmount", async () => {
  const client = {},
    pending = deferred(),
    out = vi.fn(async () => {});
  const first = run(
    client,
    () => true,
    () => pending.promise,
  );
  await Promise.resolve();
  const second = run(client, () => false, out, true);
  pending.resolve();
  await first;
  await second;
  expect(out).toHaveBeenCalledTimes(1);
});
it("rejected SDK operation cannot poison the queue", async () => {
  const client = {},
    sdk = vi.fn(async () => "done");
  await expect(
    run(
      client,
      () => true,
      async () => {
        throw new Error("Network");
      },
    ),
  ).rejects.toThrow("Network");
  expect(await run(client, () => true, sdk, true)).toEqual({
    accepted: true,
    value: "done",
  });
});
it("different SDK clients do not share a lock", async () => {
  const pending = deferred();
  const first = run(
    {},
    () => true,
    () => pending.promise,
  );
  expect(
    await run(
      {},
      () => true,
      async () => 2,
    ),
  ).toEqual({ accepted: true, value: 2 });
  pending.resolve();
  await first;
});
