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
