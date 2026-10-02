import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AdminInputError, recordPayout, shapePayoutInput, shapeShopSettlement } from "../admin";

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
      remit: false,
    });
  });

  it("a remittance (the shop paying PROSANTI) is stored as a NEGATIVE amount", () => {
    const shaped = shapePayoutInput({ shopId: "s", amountTaka: 120, method: "bkash", direction: "remit" });
    expect(shaped).toMatchObject({ amount: -12000, remit: true });
    // anything else is a normal payout, including a junk direction
    expect(shapePayoutInput({ shopId: "s", amountTaka: 120, method: "bkash", direction: "weird" })).toMatchObject({ amount: 12000, remit: false });
    // still needs a positive figure typed in
    expect(() => shapePayoutInput({ shopId: "s", amountTaka: 0, method: "bkash", direction: "remit" })).toThrow(AdminInputError);
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

/** A staff client whose shop_ledger / shop_payouts reads and payout insert are scripted. */
const payoutDb = (o: { earned: number; paid: number; insertError?: { message: string } }) => {
  const inserts: unknown[] = [];
  const db = {
    from: (table: string) => {
      if (table === "shops") {
        return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: "s1" }, error: null }) }) }) };
      }
      if (table === "shop_ledger") {
        return { select: () => ({ eq: () => ({ limit: async () => ({ data: [{ payable: o.earned }], error: null }) }) }) };
      }
      return {
        select: () => ({ eq: () => ({ limit: async () => ({ data: [{ amount: o.paid }], error: null }) }) }),
        insert: (row: unknown) => {
          inserts.push(row);
          return {
            select: () => ({
              single: async () =>
                o.insertError
                  ? { data: null, error: o.insertError }
                  : { data: { id: "p1", shop_id: "s1", amount: (row as { amount: number }).amount, method: "bkash", reference: "", paid_at: "2026-10-02T00:00:00Z" }, error: null },
            }),
          };
        },
      };
    },
  } as never;
  return { db, inserts };
};

describe("recordPayout — remittance (202610020013)", () => {
  it("records money coming IN as a negative amount while the shop owes PROSANTI", async () => {
    const { db, inserts } = payoutDb({ earned: -50000, paid: 0 });
    const line = await recordPayout(db, "staff-1", { shopId: "s1", amountTaka: 200, method: "bkash", direction: "remit" });
    expect(inserts[0]).toMatchObject({ shop_id: "s1", amount: -20000, paid_by: "staff-1" });
    expect(line.amount).toBe(-20000);
  });

  it("refuses to remit more than the shop owes, or anything when it owes nothing", async () => {
    await expect(
      recordPayout(payoutDb({ earned: -50000, paid: 0 }).db, "u", { shopId: "s1", amountTaka: 501, method: "bkash", direction: "remit" }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/more than the shop owes/) });
    await expect(
      recordPayout(payoutDb({ earned: 80000, paid: 0 }).db, "u", { shopId: "s1", amountTaka: 1, method: "bkash", direction: "remit" }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/nothing to remit/) });
  });

  it("a normal payout is still capped at the balance, and cannot be sent to a shop that owes", async () => {
    await expect(
      recordPayout(payoutDb({ earned: 80000, paid: 0 }).db, "u", { shopId: "s1", amountTaka: 801, method: "bkash" }),
    ).rejects.toMatchObject({ status: 422, message: expect.stringMatching(/exceeds/) });
    await expect(
      recordPayout(payoutDb({ earned: -50000, paid: 0 }).db, "u", { shopId: "s1", amountTaka: 1, method: "bkash" }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("maps the database's own refusal to a kind 422", async () => {
    const { db } = payoutDb({ earned: -50000, paid: 0, insertError: { message: "remittance exceeds what the shop owes" } });
    await expect(recordPayout(db, "u", { shopId: "s1", amountTaka: 100, method: "bkash", direction: "remit" })).rejects.toMatchObject({ status: 422 });
  });
});

describe("shapeShopSettlement", () => {
  it("is absent when the form did not send the model (an older form keeps saving)", () => {
    expect(shapeShopSettlement({ model: undefined, bkash: "01811111111", nagad: undefined })).toBeUndefined();
  });
  it("accepts the platform model with no numbers, and clears stored ones", () => {
    expect(shapeShopSettlement({ model: "platform", bkash: "", nagad: undefined })).toEqual({ settlement_model: "platform", wallet_bkash: null, wallet_nagad: null });
  });
  it("normalises the shop's own numbers", () => {
    expect(shapeShopSettlement({ model: "shop_wallet", bkash: "+880 1811-111111", nagad: "01922222222" })).toEqual({
      settlement_model: "shop_wallet",
      wallet_bkash: "01811111111",
      wallet_nagad: "01922222222",
    });
  });
  it("refuses an unknown model, a bad number, and a shop_wallet shop with no number at all", () => {
    expect(() => shapeShopSettlement({ model: "nope", bkash: "", nagad: "" })).toThrow(/how the shop is paid/);
    expect(() => shapeShopSettlement({ model: "shop_wallet", bkash: "123", nagad: "" })).toThrow(/bKash number must be/);
    expect(() => shapeShopSettlement({ model: "shop_wallet", bkash: "", nagad: "" })).toThrow(/bKash or Nagad number first/);
  });
});
