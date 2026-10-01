/**
 * Failed delivery flow (202610010001 — audit N5): the rider-side RPC wrapper
 * (final vs retry, honest errors, which client calls the RPC) and the staff
 * resolution (redispatch / cancel) with its action list.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  clampMaxAttempts,
  failedRiderAttempt,
  listAwaitingDispatchOrders,
  listFailedDeliveries,
  releaseDispatchAssignment,
  resolveFailedDelivery,
} from "../riders";

const ORDER_UUID = "11111111-1111-4111-8111-111111111111";

describe("clampMaxAttempts", () => {
  it("mirrors the SQL clamp: default 2, 1..5", () => {
    expect(clampMaxAttempts(undefined)).toBe(2);
    expect(clampMaxAttempts(null)).toBe(1); // Number(null) === 0 → clamped up, as the SQL does
    expect(clampMaxAttempts(0)).toBe(1);
    expect(clampMaxAttempts(3)).toBe(3);
    expect(clampMaxAttempts("4")).toBe(4);
    expect(clampMaxAttempts(99)).toBe(5);
    expect(clampMaxAttempts("abc")).toBe(2);
  });
});

describe("failedRiderAttempt", () => {
  const rider = (result: { data?: unknown; error?: { message: string } | null }) => {
    const rpc = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }));
    return { rpc } as unknown as { rpc: ReturnType<typeof vi.fn> };
  };
  const service = (attempts: number, max: unknown) => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === "orders" ? { delivery_attempts: attempts } : { value: max },
          }),
        }),
      }),
    }),
  });

  it("runs the RPC on the rider's own client and reports a retry", async () => {
    const db = rider({ data: { state: "picked_up", order_id: "o1" } });
    const out = await failedRiderAttempt(db as never, "a1", "phone off", service(1, 2) as never);
    expect(db.rpc).toHaveBeenCalledWith("ps_rider_failed_attempt", {
      p_assignment_id: "a1",
      p_reason: "phone off",
    });
    expect(out).toEqual({ final: false, attempts: 1, maxAttempts: 2 });
  });

  it("flags the final attempt (the job is closed)", async () => {
    const db = rider({ data: { state: "failed", order_id: "o1" } });
    const out = await failedRiderAttempt(db as never, "a1", "no one home", service(2, 2) as never);
    expect(out).toMatchObject({ final: true, attempts: 2, maxAttempts: 2 });
  });

  it("works without a service client (counter is best-effort)", async () => {
    const db = rider({ data: [{ state: "failed", order_id: "o1" }] });
    expect(await failedRiderAttempt(db as never, "a1", "no one home")).toEqual({ final: true });
  });

  it("explains a report before pickup in the rider's language, with a 409", async () => {
    const db = rider({ error: { message: "failed attempt not allowed from accepted" } });
    await expect(failedRiderAttempt(db as never, "a1", "phone off")).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining("পিকআপ"),
    });
  });

  it("maps a missing reason and someone else's job", async () => {
    await expect(
      failedRiderAttempt(rider({ error: { message: "a reason is required" } }) as never, "a1", "x"),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      failedRiderAttempt(rider({ error: { message: "forbidden" } }) as never, "a1", "phone off"),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("resolveFailedDelivery", () => {
  const staff = (error: { message: string; code?: string } | null = null) => {
    const rpc = vi.fn(async () => ({ data: null, error }));
    return { rpc } as unknown as { rpc: ReturnType<typeof vi.fn> };
  };

  it("sends the decision through the staff client (ps_is_admin needs auth.uid)", async () => {
    const db = staff();
    await resolveFailedDelivery(db as never, ORDER_UUID, "redispatch", " shop has it ");
    expect(db.rpc).toHaveBeenCalledWith("ps_admin_resolve_failed_delivery", {
      p_order_id: ORDER_UUID,
      p_action: "redispatch",
      p_note: "shop has it",
    });
  });

  it("answers 409 when nothing is waiting, 503 before the migration", async () => {
    await expect(
      resolveFailedDelivery(staff({ message: "no failed delivery to resolve" }) as never, ORDER_UUID, "cancel", "dead"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      resolveFailedDelivery(
        staff({ code: "42883", message: "function does not exist" }) as never,
        ORDER_UUID,
        "cancel",
        "dead",
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});

describe("failed delivery lists", () => {
  it("degrades to an empty list before the migration (no crash)", async () => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "not", "order", "limit"]) chain[m] = () => chain;
    chain.then = (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: null, error: { code: "42703", message: "column does not exist" } }).then(resolve);
    expect(await listFailedDeliveries({ from: () => chain } as never)).toEqual([]);
  });

  it("keeps flagged orders out of 'awaiting dispatch' (they have their own list)", async () => {
    const orderRows = [
      { id: "o-failed", status: "out-for-delivery", is_pickup: false, delivery_failed_at: "2026-10-01T05:00:00Z" },
    ];
    const chain = (rows: unknown[]) => {
      const c: Record<string, unknown> = {};
      for (const m of ["select", "in", "order", "limit"]) c[m] = () => c;
      c.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: rows, error: null }).then(resolve);
      return c;
    };
    const db = { from: (t: string) => chain(t === "orders" ? orderRows : []) };
    expect(await listAwaitingDispatchOrders(db as never)).toEqual([]);
  });
});

describe("releaseDispatchAssignment", () => {
  const staff = (error: { message: string; code?: string } | null = null) => {
    const rpc = vi.fn(async () => ({ data: null, error }));
    return { rpc } as unknown as { rpc: ReturnType<typeof vi.fn> };
  };

  it("releases through the staff client with the reason", async () => {
    const db = staff();
    await releaseDispatchAssignment(db as never, "a1", "rider unreachable");
    expect(db.rpc).toHaveBeenCalledWith("ps_admin_release_assignment", {
      p_assignment_id: "a1",
      p_reason: "rider unreachable",
    });
  });

  it("maps: finished job → 409, short reason → 422, migration pending → 503", async () => {
    await expect(
      releaseDispatchAssignment(staff({ message: "assignment not active" }) as never, "a1", "rider unreachable"),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      releaseDispatchAssignment(staff({ message: "a reason is required" }) as never, "a1", "no"),
    ).rejects.toMatchObject({ status: 422 });
    await expect(
      releaseDispatchAssignment(
        staff({ code: "42883", message: "function does not exist" }) as never,
        "a1",
        "rider unreachable",
      ),
    ).rejects.toMatchObject({ status: 503 });
  });
});
