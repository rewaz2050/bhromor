import { describe, expect, it } from "vitest";
import {
  balanceKind,
  normalizeWalletNumber,
  parseSettlementModel,
  requireSettlementModel,
  walletsForCart,
  type CartShop,
} from "../shop-settlement";

const platform = { bkash: "01700000001", nagad: "01700000002" };
const own = (id: string, wallets = { bkash: "01811111111" } as { bkash?: string; nagad?: string }): CartShop => ({
  id,
  name: `Shop ${id}`,
  settlementModel: "shop_wallet",
  wallets,
});
const plain = (id: string): CartShop => ({ id, settlementModel: "platform", wallets: {} });

describe("settlement model", () => {
  it("reads anything unknown as the platform model", () => {
    expect(parseSettlementModel("shop_wallet")).toBe("shop_wallet");
    expect(parseSettlementModel("platform")).toBe("platform");
    for (const v of [undefined, null, "", "SHOP_WALLET", 7]) expect(parseSettlementModel(v)).toBe("platform");
  });
  it("is strict for admin input", () => {
    expect(requireSettlementModel("shop_wallet")).toBe("shop_wallet");
    expect(requireSettlementModel("platform")).toBe("platform");
    expect(requireSettlementModel("nope")).toBeNull();
    expect(requireSettlementModel(undefined)).toBeNull();
  });
});

describe("wallet numbers", () => {
  it("accepts a Bangladeshi mobile in the usual spellings and refuses the rest", () => {
    expect(normalizeWalletNumber("01711-111111")).toBe("01711111111");
    expect(normalizeWalletNumber("+880 1711 111111")).toBe("01711111111");
    expect(normalizeWalletNumber("8801711111111")).toBe("01711111111");
    for (const v of ["", "123", "02711111111", "0171111111", null, undefined, 1711111111]) expect(normalizeWalletNumber(v)).toBe("");
  });
});

describe("walletsForCart", () => {
  it("uses PROSANTI's numbers when no shop sells into its own wallet (the unchanged default)", () => {
    expect(walletsForCart(platform, [])).toEqual({ ...platform, payTo: "platform" });
    expect(walletsForCart(platform, [plain("a")])).toEqual({ ...platform, payTo: "platform" });
    expect(walletsForCart(platform, [plain("a"), plain("b")])).toEqual({ ...platform, payTo: "platform" });
  });
  it("uses the shop's own numbers for a single shop that sells into its own wallet — only the ones it set", () => {
    expect(walletsForCart(platform, [own("a")])).toEqual({ bkash: "01811111111", nagad: undefined, payTo: "shop", payeeName: "Shop a" });
    expect(walletsForCart({}, [own("a", { nagad: "01822222222" })]).nagad).toBe("01822222222");
  });
  it("offers no wallet at all when such a shop shares the bag with another shop (COD only)", () => {
    expect(walletsForCart(platform, [own("a"), plain("b")])).toEqual({ payTo: "shop" });
    expect(walletsForCart(platform, [own("a"), own("b")])).toEqual({ payTo: "shop" });
  });
  it("never falls back to PROSANTI's number for a shop that sells into its own wallet", () => {
    const r = walletsForCart(platform, [own("a", {})]);
    expect(r.bkash).toBeUndefined();
    expect(r.nagad).toBeUndefined();
  });
});

describe("balanceKind", () => {
  it("negative = the shop owes PROSANTI", () => {
    expect(balanceKind(500)).toBe("owed_to_shop");
    expect(balanceKind(-1)).toBe("owed_by_shop");
    expect(balanceKind(0)).toBe("settled");
  });
});
