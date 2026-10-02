/** Item I: the expiry sweep (rider feed, dispatch board, cron) may create offers → it nudges rider push afterwards. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const calls = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/rider-push", () => ({
  pushPendingRiderOffers: async () => {
    calls.push("push");
    return { claimed: 0, riders: 0 };
  },
}));

import { expireStaleAssignments } from "../riders";

const service = (error: { code?: string; message: string } | null) =>
  ({ rpc: async () => { calls.push("sweep"); return { error }; } }) as never;

beforeEach(() => { calls.length = 0; });

describe("expireStaleAssignments → rider push", () => {
  it("pushes after a successful sweep, in that order", async () => {
    await expireStaleAssignments(service(null));
    expect(calls).toEqual(["sweep", "push"]);
  });

  it("does not push when the sweep RPC is missing (old database) or fails", async () => {
    await expireStaleAssignments(service({ code: "PGRST202", message: "function does not exist" }));
    expect(calls).toEqual(["sweep"]);
    calls.length = 0;
    await expect(expireStaleAssignments(service({ message: "boom" }))).rejects.toThrow("boom");
    expect(calls).toEqual(["sweep"]);
  });
});
