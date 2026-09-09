import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  GET as payoutsGet,
  POST as payoutsPost,
} from "../admin/payouts/route";

describe("payout routes without a staff session (slice 5)", () => {
  it("401s reads and writes", async () => {
    expect(
      (await payoutsGet(new Request("http://localhost/api/admin/payouts")))
        .status,
    ).toBe(401);
    expect(
      (
        await payoutsPost(
          new Request("http://localhost/api/admin/payouts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shopId: "s", amountTaka: 1, method: "cash" }),
          }),
        )
      ).status,
    ).toBe(401);
  });
});
