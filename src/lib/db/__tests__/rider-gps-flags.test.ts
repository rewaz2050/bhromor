import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getRiderGpsFlags } from "../rider-gps-flags";

const NOW = Date.parse("2026-10-03T06:00:00Z");

const makeDb = (o: { rows?: unknown[]; error?: { message?: string; code?: string }; count?: number }) => {
  const db = {
    from: () => ({
      select: (_cols: string, opts?: { head?: boolean }) => {
        const chain = {
          eq: () => chain,
          order: () => chain,
          gte: async () => ({ count: o.count ?? 0, error: null }),
          limit: async () => ({ data: o.rows ?? [], error: o.error ?? null }),
        };
        return opts?.head ? { eq: () => ({ gte: async () => ({ count: o.count ?? 0, error: null }) }) } : chain;
      },
    }),
  } as never;
  return db;
};

const row = (id: string, ago: number) => ({
  id,
  created_at: new Date(NOW - ago).toISOString(),
  from_lat: 24.89, from_lng: 91.87, to_lat: 25.3, to_lng: 92.3,
  distance_m: 60_250, seconds: 60, speed_kmh: 3615,
});

describe("getRiderGpsFlags", () => {
  it("shapes rows for the card (km to one decimal) and counts the last 30 days", async () => {
    const r = await getRiderGpsFlags(makeDb({ rows: [row("a", 1000), row("b", 40 * 86_400_000)] }), "r1", NOW);
    expect(r.ready).toBe(true);
    expect(r.flags[0]).toMatchObject({ id: "a", distanceKm: 60.3, seconds: 60, speedKmh: 3615, to: { lat: 25.3, lng: 92.3 } });
    expect(r.last30Days).toBe(1);
  });

  it("uses a head-only count when the list is full, so the number is not capped at 20", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(`f${i}`, i * 1000));
    const r = await getRiderGpsFlags(makeDb({ rows, count: 57 }), "r1", NOW);
    expect(r.last30Days).toBe(57);
  });

  it("says 'not ready' when the migration has not run, and throws on a real failure", async () => {
    expect(await getRiderGpsFlags(makeDb({ error: { code: "42P01", message: "relation does not exist" } }), "r1", NOW)).toEqual({ ready: false, flags: [], last30Days: 0 });
    await expect(getRiderGpsFlags(makeDb({ error: { code: "XX000", message: "boom" } }), "r1", NOW)).rejects.toThrow(/GPS alerts/);
  });
});
