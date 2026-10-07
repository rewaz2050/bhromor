/**
 * Delivery zones: one read for the whole page (fix-all pass 2026-10-07).
 *
 * The hook used to fetch /api/zones from every consumer's own useState — the
 * header's area pill, the home delivery check, checkout and the vendor's
 * settings page each fired their own request on every page, and each flashed
 * the shipped fallback rows before its copy answered.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { __resetLiveCatalog } from "../live-catalog";
import { useLiveZones } from "../use-live-zones";
import { DELIVERY_ZONES } from "../catalog";

const live = [
  { id: "z1", name: "Sadar", charge: 6000, etaLabel: "45–50 min", active: true },
  { id: "z2", name: "Borpara", charge: 7000, etaLabel: "50–60 min", active: true },
  { id: "z9", name: "Off", charge: 0, etaLabel: "-", active: false },
];

const originalFetch = globalThis.fetch;

beforeEach(() => {
  __resetLiveCatalog();
  globalThis.fetch = vi.fn(() =>
    Promise.resolve(Response.json({ zones: live })),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup();
});

describe("useLiveZones", () => {
  it("serves the shipped zones while the read is in flight", () => {
    const { result } = renderHook(() => useLiveZones());
    // Never an empty list that pops into a full one a moment later.
    expect(result.current.activeZones.length).toBeGreaterThan(0);
    expect(result.current.loading).toBe(true);
  });

  it("asks once for the whole page, however many consumers there are", async () => {
    const a = renderHook(() => useLiveZones());
    const b = renderHook(() => useLiveZones());
    await waitFor(() => expect(a.result.current.loading).toBe(false));
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(b.result.current.activeZones.map((z) => z.id)).toEqual(["z1", "z2"]);
  });

  it("drops the zones the shop has switched off", async () => {
    const { result } = renderHook(() => useLiveZones());
    await waitFor(() => expect(result.current.live).toBe(true));
    expect(result.current.activeZones.map((z) => z.id)).toEqual(["z1", "z2"]);
  });

  it("paints from memory on a revisit — no second request, no flash", async () => {
    const first = renderHook(() => useLiveZones());
    await waitFor(() => expect(first.result.current.live).toBe(true));
    first.unmount();

    const second = renderHook(() => useLiveZones());
    // First render already has the rows.
    expect(second.result.current.live).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    await act(async () => {});
  });

  it("keeps the fallback rows when the backend answers nothing", async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(Response.json({ zones: [] })),
    ) as unknown as typeof fetch;
    const { result } = renderHook(() => useLiveZones());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.zones).toBe(DELIVERY_ZONES);
    expect(result.current.live).toBe(false);
  });
});
