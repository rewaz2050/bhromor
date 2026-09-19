import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { AdminInputError, verifyPaymentAsStaff } from "../admin";

/**
 * A minimal fake of the Supabase client for verifyPaymentAsStaff:
 * the order lookup always succeeds; the RPC fails with the given message
 * (Postgres errors surface as { error: { message } }).
 */
const fakeDb = (rpcMessage: string) =>
  ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { id: "order-uuid" }, error: null }),
        }),
      }),
    }),
    rpc: async () => ({
      error: { message: rpcMessage },
    }),
  }) as never;

describe("verifyPaymentAsStaff error mapping (P1 #8)", () => {
  it("maps 'order already cancelled' to 422 with a human sentence", async () => {
    await expect(
      verifyPaymentAsStaff(fakeDb("order already cancelled"), "PS-1", "verified"),
    ).rejects.toMatchObject({
      status: 422,
      message: expect.stringMatching(/cancelled/i),
    });
  });

  it("maps 'payment already decided' to 409", async () => {
    await expect(
      verifyPaymentAsStaff(
        fakeDb("payment already decided"),
        "PS-1",
        "rejected",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("maps 'not a wallet payment' to 422", async () => {
    await expect(
      verifyPaymentAsStaff(fakeDb("not a wallet payment"), "PS-1", "verified"),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("maps 'forbidden' to 403", async () => {
    await expect(
      verifyPaymentAsStaff(fakeDb("forbidden"), "PS-1", "verified"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("wraps unknown RPC failures as 422", async () => {
    await expect(
      verifyPaymentAsStaff(fakeDb("some surprise"), "PS-1", "verified"),
    ).rejects.toBeInstanceOf(AdminInputError);
  });
});
