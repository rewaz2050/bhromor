/**
 * Address book sync (2026-10-11).
 *
 * The browser copy is the store checkout actually reads, so the one promise
 * this module makes is that nothing it does can damage it: a signed-out
 * shopper, an unmigrated table or a dropped request all leave the local book
 * exactly as it was. The merge is the other half — remote rows arrive, local
 * rows survive, and the cap holds.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSavedAddresses, setSavedAddresses, type SavedAddress } from "@/lib/address-book";
import { addressSyncState, pushAddresses, syncAddresses } from "@/lib/address-sync";

const addr = (id: string, phone = "01712345678", over: Partial<SavedAddress> = {}): SavedAddress => ({
  id,
  label: `🏠 ${id}`,
  name: "Rahim",
  phone,
  area: "Boropara",
  houseNo: "12",
  roadName: "Main Road",
  fullAddress: "Near the mosque",
  note: "",
  zoneId: "z1",
  district: "Sunamganj",
  upazila: "Sunamganj Sadar",
  tag: "home",
  createdAt: 1_760_000_000_000,
  ...over,
});

const originalFetch = globalThis.fetch;
let putBodies: unknown[] = [];

const respond = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => {
  window.localStorage.clear();
  putBodies = [];
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("syncAddresses", () => {
  it("leaves the local book alone for a signed-out shopper", async () => {
    setSavedAddresses([addr("local-1")]);
    globalThis.fetch = vi.fn(async () => respond(401)) as unknown as typeof fetch;

    const out = await syncAddresses();

    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("local-1");
    expect(addressSyncState()).toBe("signed-out");
    // Nothing was pushed back either.
    expect(putBodies).toHaveLength(0);
  });

  it("leaves the local book alone when the table has not been migrated", async () => {
    setSavedAddresses([addr("local-1")]);
    globalThis.fetch = vi.fn(async () => respond(501, { reason: "missing_table" })) as unknown as typeof fetch;

    const out = await syncAddresses();

    expect(out[0].id).toBe("local-1");
    expect(addressSyncState()).toBe("missing-table");
  });

  it("brings another device's addresses onto this one", async () => {
    setSavedAddresses([addr("local-only")]);
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        putBodies.push(JSON.parse(String(init.body)) as { addresses: SavedAddress[] });
        return respond(200, { saved: true });
      }
      return respond(200, { addresses: [addr("from-phone"), addr("from-laptop")] });
    }) as unknown as typeof fetch;

    const out = await syncAddresses();

    // Both remote rows landed, and the one this device already had survived.
    expect(out.map((a) => a.id)).toEqual(["from-phone", "from-laptop", "local-only"]);
    expect(getSavedAddresses().map((a) => a.id)).toEqual([
      "from-phone",
      "from-laptop",
      "local-only",
    ]);
    // The union went back up, so the other devices get "local-only" too.
    expect(putBodies).toHaveLength(1);
    expect((putBodies[0] as { addresses: SavedAddress[] }).addresses).toHaveLength(3);
    expect(addressSyncState()).toBe("ok");
  });

  it("keeps the local copy of a row both sides have", async () => {
    setSavedAddresses([addr("shared", "01712345678", { houseNo: "99 (edited here)" })]);
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") return respond(200, { saved: true });
      return respond(200, { addresses: [addr("shared", "01712345678", { houseNo: "12" })] });
    }) as unknown as typeof fetch;

    const out = await syncAddresses();

    // Checkout is about to read this row, so the device's own edit wins.
    expect(out[0].houseNo).toBe("99 (edited here)");
  });

  it("never holds more than five", async () => {
    setSavedAddresses([addr("l1"), addr("l2"), addr("l3")]);
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") return respond(200, { saved: true });
      return respond(200, { addresses: [addr("r1"), addr("r2"), addr("r3"), addr("r4")] });
    }) as unknown as typeof fetch;

    const out = await syncAddresses();

    expect(out).toHaveLength(5);
    expect(getSavedAddresses()).toHaveLength(5);
  });

  it("survives a network failure without touching anything", async () => {
    setSavedAddresses([addr("local-1")]);
    globalThis.fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    const out = await syncAddresses();

    expect(out[0].id).toBe("local-1");
    expect(addressSyncState()).toBe("error");
  });
});

describe("pushAddresses", () => {
  it("sends the local book and says so", async () => {
    setSavedAddresses([addr("a"), addr("b")]);
    globalThis.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      putBodies.push(JSON.parse(String(init?.body)) as { addresses: SavedAddress[] });
      return respond(200, { saved: true });
    }) as unknown as typeof fetch;

    expect(await pushAddresses()).toBe(true);
    expect((putBodies[0] as { addresses: SavedAddress[] }).addresses).toHaveLength(2);
    expect(addressSyncState()).toBe("ok");
  });

  it("reports false instead of throwing when the write fails", async () => {
    setSavedAddresses([addr("a")]);
    globalThis.fetch = vi.fn(async () => respond(503)) as unknown as typeof fetch;
    expect(await pushAddresses()).toBe(false);
    expect(addressSyncState()).toBe("error");
  });
});
