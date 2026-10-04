/** Item N: staff record the licence date; the sweep enforces it. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { assertLicenceAllowsOnline, getRiderLicence, runLicenceSweep, setRiderLicenceExpiry } from "../licence-expiry";

// 2026-10-02 12:00 Dhaka
const NOW = Date.parse("2026-10-02T06:00:00.000Z");

type Row = Record<string, unknown>;
const calls: { op: string; args: unknown[] }[] = [];
let reply: { data: unknown; error: unknown } = { data: [], error: null };

const builder = () => {
  const chain: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "not", "lte", "limit", "update", "maybeSingle"]) {
    chain[m] = (...args: unknown[]) => {
      calls.push({ op: m, args });
      return chain;
    };
  }
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(reply).then(ok);
  return chain;
};
const db = { from: () => builder() } as never;

beforeEach(() => {
  calls.length = 0;
  reply = { data: [], error: null };
});

describe("getRiderLicence / setRiderLicenceExpiry", () => {
  it("reads the date and judges it against the Dhaka day", async () => {
    reply = { data: { vehicle: "bike", licence_expires_on: "2026-10-01" }, error: null };
    const l = await getRiderLicence(db, "r1", NOW);
    expect(l).toMatchObject({ expiresOn: "2026-10-01", status: { kind: "expired", blocked: true } });
  });
  it("returns null when the column is not migrated", async () => {
    reply = { data: null, error: { code: "42703", message: "column riders.licence_expires_on does not exist" } };
    expect(await getRiderLicence(db, "r1", NOW)).toBeNull();
  });
  it("refuses a nonsense date and a missing rider", async () => {
    await expect(setRiderLicenceExpiry(db, "r1", "31/12/2027", NOW)).rejects.toMatchObject({ status: 422 });
    reply = { data: null, error: null };
    await expect(setRiderLicenceExpiry(db, "r1", "2028-01-01", NOW)).rejects.toMatchObject({ status: 404 });
  });
  it("tells the owner which migration to run when the column is missing", async () => {
    reply = { data: null, error: { code: "42703", message: "column riders.licence_expires_on does not exist" } };
    await expect(setRiderLicenceExpiry(db, "r1", "2028-01-01", NOW)).rejects.toThrow(/202610020005/);
  });
  it("writes the date (or null to clear)", async () => {
    reply = { data: { id: "r1", vehicle: "bike", licence_expires_on: "2028-01-01" }, error: null };
    await setRiderLicenceExpiry(db, "r1", "2028-01-01", NOW);
    expect(calls.find((c) => c.op === "update")?.args[0]).toEqual({ licence_expires_on: "2028-01-01" });
    calls.length = 0;
    await setRiderLicenceExpiry(db, "r1", null, NOW);
    expect(calls.find((c) => c.op === "update")?.args[0]).toEqual({ licence_expires_on: null });
  });
});

describe("assertLicenceAllowsOnline", () => {
  it("blocks a lapsed licence with a Bangla 403, allows a valid or unrecorded one, fails open on a read error", async () => {
    reply = { data: { vehicle: "scooter", licence_expires_on: "2026-09-30" }, error: null };
    await expect(assertLicenceAllowsOnline(db, "r1", NOW)).rejects.toMatchObject({ status: 403 });
    reply = { data: { vehicle: "scooter", licence_expires_on: "2027-09-30" }, error: null };
    await expect(assertLicenceAllowsOnline(db, "r1", NOW)).resolves.toBeUndefined();
    reply = { data: { vehicle: "bike", licence_expires_on: null }, error: null };
    await expect(assertLicenceAllowsOnline(db, "r1", NOW)).resolves.toBeUndefined();
    reply = { data: null, error: { code: "XX000", message: "boom" } };
    await expect(assertLicenceAllowsOnline(db, "r1", NOW)).resolves.toBeUndefined();
  });
});

describe("runLicenceSweep", () => {
  const claimed = new Set<string>();
  const staff: { title: string; body: string }[] = [];
  const pushes: { riderId: string; important: boolean }[] = [];
  const deps = (marksMissing = false) => ({
    claim: async (key: string) => {
      if (marksMissing) throw new Error("no marks");
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
    notifyStaff: async (title: string, body: string) => {
      staff.push({ title, body });
    },
    pushRider: async (riderId: string, _t: string, _b: string, important: boolean) => {
      pushes.push({ riderId, important });
    },
  });
  const rows: Row[] = [
    { id: "a", name: "Expired Online", vehicle: "bike", is_online: true, licence_expires_on: "2026-09-20" },
    { id: "b", name: "Expired Offline", vehicle: "scooter", is_online: false, licence_expires_on: "2026-10-01" },
    { id: "c", name: "Soon", vehicle: "bike", is_online: true, licence_expires_on: "2026-10-10" },
  ];
  beforeEach(() => {
    claimed.clear();
    staff.length = 0;
    pushes.length = 0;
    reply = { data: rows, error: null };
  });

  it("takes only lapsed ONLINE riders offline, and alerts once per rider per date", async () => {
    const first = await runLicenceSweep(db, NOW, deps());
    expect(first.status).toBe("ran");
    const offline = calls.filter((c) => c.op === "update");
    expect(offline).toHaveLength(1);
    expect(offline[0].args[0]).toEqual({ is_online: false });
    expect(calls.find((c) => c.op === "in" && (c.args[1] as string[]).includes("a") )?.args[1]).toEqual(["a"]);
    expect(staff).toHaveLength(1);
    expect(staff[0].body).toContain("Expired Online");
    expect(staff[0].body).toContain("Soon (8d)");
    expect(pushes.map((p) => [p.riderId, p.important])).toEqual([["a", true], ["b", true], ["c", false]]);

    staff.length = 0;
    pushes.length = 0;
    await runLicenceSweep(db, NOW, deps());
    expect(staff).toHaveLength(0); // already claimed — no nagging every 15 minutes
    expect(pushes).toHaveLength(0);
  });

  it("still takes riders offline when cron_marks is missing, but sends no alerts", async () => {
    const r = await runLicenceSweep(db, NOW, deps(true));
    expect(calls.filter((c) => c.op === "update")).toHaveLength(1);
    expect(staff).toHaveLength(0);
    expect(r.detail).toContain("cron_marks missing");
  });

  it("skips when the column is not migrated and fails soft on other errors", async () => {
    reply = { data: null, error: { code: "42703", message: "column riders.licence_expires_on does not exist" } };
    expect((await runLicenceSweep(db, NOW, deps())).status).toBe("skipped");
    reply = { data: null, error: { code: "XX000", message: "boom" } };
    expect((await runLicenceSweep(db, NOW, deps())).status).toBe("failed");
  });
});
