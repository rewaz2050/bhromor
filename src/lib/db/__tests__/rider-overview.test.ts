import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getRiderOverview } from "../rider-overview";

const rpc = (result: { data: unknown; error: unknown }, log: unknown[] = []) => ({
  rpc: (name: string, args: unknown) => {
    log.push([name, args]);
    return Promise.resolve(result);
  },
});

describe("getRiderOverview", () => {
  it("calls the staff RPC with the rider id and normalises the answer", async () => {
    const log: unknown[] = [];
    const out = await getRiderOverview(rpc({ data: { rider: { id: "r1", name: "Rafiq" }, money: { cashInHand: 5 } }, error: null }, log) as never, "r1");
    expect(log).toEqual([["ps_admin_rider_overview", { p_rider_id: "r1" }]]);
    expect(out?.rider.name).toBe("Rafiq");
    expect(out?.money.cashInHand).toBe(5);
  });

  it("null when the function is not migrated", async () => {
    expect(await getRiderOverview(rpc({ data: null, error: { code: "PGRST202", message: "function not found" } }) as never, "r1")).toBeNull();
  });

  it("maps refusals to 404 / 403 and anything else to a plain error", async () => {
    await expect(getRiderOverview(rpc({ data: null, error: { message: "rider_not_found" } }) as never, "r1")).rejects.toMatchObject({ status: 404 });
    await expect(getRiderOverview(rpc({ data: null, error: { message: "forbidden" } }) as never, "r1")).rejects.toMatchObject({ status: 403 });
    await expect(getRiderOverview(rpc({ data: null, error: { message: "boom" } }) as never, "r1")).rejects.toThrow("overview read failed");
  });
});
