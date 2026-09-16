import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { placementErrorFrom } from "../orders";

describe("placementErrorFrom (ps_place_order failures)", () => {
  it("maps P0001 raises to 422 with the database message", () => {
    const err = placementErrorFrom({
      code: "P0001",
      message: "Coupon WELCOME100 is no longer valid.",
    });
    expect(err.status).toBe(422);
    expect(err.field).toBe("couponCode");
    expect(err.message).toContain("WELCOME100");
  });

  it("sniffs the field from the message", () => {
    expect(
      placementErrorFrom({ code: "P0001", message: "Unknown delivery zone." })
        .field,
    ).toBe("zoneId");
    expect(
      placementErrorFrom({ code: "P0001", message: "Only 2 left of p1." }).field,
    ).toBe("items");
    expect(
      placementErrorFrom({ code: "P0001", message: "Something else." }).field,
    ).toBe("order");
  });

  it("maps anything else to a generic 503 (no internals leak)", () => {
    const err = placementErrorFrom({
      code: "XX000",
      message: "internal: deadlock detected",
    });
    expect(err.status).toBe(503);
    expect(err.field).toBe("order");
    expect(err.message).not.toContain("deadlock");
  });
});

describe("placementErrorFrom shop messages (marketplace slice 1)", () => {
  it("maps shop-guard raises to items-field 422s", () => {
    for (const message of [
      "shop unavailable",
      "shop closed",
      "order mixes multiple shops",
    ]) {
      const err = placementErrorFrom({ code: "P0001", message });
      expect(err.status).toBe(422);
      expect(err.field).toBe("items");
    }
    // Zone mismatch points at the zone picker instead.
    const zoneErr = placementErrorFrom({
      code: "P0001",
      message: "shop does not deliver to zone",
    });
    expect(zoneErr.status).toBe(422);
    expect(zoneErr.field).toBe("zoneId");
  });
});

describe("placementErrorFrom schema gaps (2026-09-16 checkout outage)", () => {
  it("names the repair migration for the gift_wrap NOT NULL violation", async () => {
    const { schemaGapFor } = await import("../orders");
    const raw = {
      code: "23502",
      message: 'null value in column "gift_wrap" of relation "orders" violates not-null constraint',
    };
    expect(schemaGapFor(raw)).toContain("202609160002_order_insert_repair.sql");
    expect(schemaGapFor(raw)).toContain("gift_wrap");
    const err = placementErrorFrom(raw);
    expect(err.status).toBe(503);
    expect(err.field).toBe("order");
    expect(err.message).not.toContain("gift_wrap");
    expect(err.message).toMatch(/temporarily unavailable/i);
  });

  it("treats the outdated phase-1 guard raises as a schema gap, not a form error", async () => {
    const { schemaGapFor } = await import("../orders");
    for (const message of [
      "order total does not reconcile",
      "only cash on delivery is enabled",
    ]) {
      expect(schemaGapFor({ code: "P0001", message })).toContain("202609160002");
      const err = placementErrorFrom({ code: "P0001", message });
      expect(err.status).toBe(503);
      expect(err.message).not.toContain(message);
    }
  });

  it("names a missing column / relation / function", async () => {
    const { schemaGapFor } = await import("../orders");
    expect(schemaGapFor({ code: "42703", message: 'column "gift_fee" does not exist' })).toContain("gift_fee");
    expect(schemaGapFor({ code: "42P01", message: 'relation "memberships" does not exist' })).toContain("memberships");
    expect(schemaGapFor({ code: "PGRST202", message: "Could not find the function" })).toContain("ps_place_order");
    expect(placementErrorFrom({ code: "42703", message: 'column "gift_fee" does not exist' }).status).toBe(503);
  });

  it("leaves genuine customer-facing raises alone", async () => {
    const { schemaGapFor } = await import("../orders");
    expect(schemaGapFor({ code: "P0001", message: "Zone D requires minimum ৳500 order" })).toBeNull();
    expect(schemaGapFor({ code: "P0001", message: 'only 2 left of "Lumgi"' })).toBeNull();
    expect(placementErrorFrom({ code: "P0001", message: "coupon expired" }).status).toBe(422);
  });
});
