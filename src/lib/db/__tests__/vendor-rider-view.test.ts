/** Audit H — the shop's rider lookup parses defensively and never breaks the order page. */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { parseShopRider, readShopRider } from "../vendor";

const rpc = (result: { data?: unknown; error?: { code?: string; message: string } | null }) => ({
  rpc: async () => ({ data: null, error: null, ...result }),
});

describe("parseShopRider", () => {
  it("accepts accepted / picked_up jobs only", () => {
    expect(parseShopRider({ name: "R", phone: "017", vehicle: "bike", state: "picked_up" })).toEqual({
      name: "R", phone: "017", vehicle: "bike", state: "picked_up",
    });
    expect(parseShopRider({ name: "R", phone: "017", state: "offered" })).toBeNull();
    expect(parseShopRider({ name: "R", state: "accepted" })).toBeNull();
    expect(parseShopRider(null)).toBeNull();
    expect(parseShopRider("x")).toBeNull();
  });
});

describe("readShopRider", () => {
  it("returns the rider from the RPC", async () => {
    const r = await readShopRider(
      rpc({ data: { name: "Karim", phone: "018", vehicle: "scooter", state: "accepted" } }) as never,
      "o1",
    );
    expect(r?.name).toBe("Karim");
  });

  it("is null (never a throw) before the migration or on any failure", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await readShopRider(rpc({ error: { code: "PGRST202", message: "Could not find the function" } }) as never, "o1")).toBeNull();
    expect(quiet).not.toHaveBeenCalled();
    expect(await readShopRider(rpc({ error: { message: "boom" } }) as never, "o1")).toBeNull();
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
});
