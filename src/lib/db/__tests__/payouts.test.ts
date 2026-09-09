import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AdminInputError, shapePayoutInput } from "../admin";

describe("shapePayoutInput (slice 5)", () => {
  it("shapes a valid payout, converting taka to paisa", () => {
    expect(
      shapePayoutInput({
        shopId: "shop-1",
        amountTaka: 2500,
        method: "bkash",
        reference: " TRX123 ",
      }),
    ).toEqual({
      shopId: "shop-1",
      amount: 250000,
      method: "bkash",
      reference: "TRX123",
    });
  });

  it("rounds fractional taka to whole paisa", () => {
    expect(
      shapePayoutInput({ shopId: "s", amountTaka: 10.555, method: "cash" })
        .amount,
    ).toBe(1056);
  });

  it("rejects missing shops, bad amounts and bad methods", () => {
    const bad: unknown[] = [
      { amountTaka: 100, method: "bank" },
      { shopId: "s", method: "bank" },
      { shopId: "s", amountTaka: 0, method: "bank" },
      { shopId: "s", amountTaka: -5, method: "bank" },
      { shopId: "s", amountTaka: 100, method: "crypto" },
      { shopId: "s", amountTaka: 100 },
      null,
    ];
    for (const raw of bad) {
      try {
        shapePayoutInput(raw);
        expect.unreachable(`should reject ${JSON.stringify(raw)}`);
      } catch (err) {
        expect(err).toBeInstanceOf(AdminInputError);
      }
    }
  });

  it("lower-cases the method and trims the reference", () => {
    const shaped = shapePayoutInput({
      shopId: "s",
      amountTaka: 1,
      method: "BKASH",
      reference: "  x  ",
    });
    expect(shaped.method).toBe("bkash");
    expect(shaped.reference).toBe("x");
  });
});
