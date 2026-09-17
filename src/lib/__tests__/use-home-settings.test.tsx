import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { HOME_DEFAULTS } from "../home-cms";
import {
  __resetHomeSettings,
  publishHomeSettings,
  useHomeSettings,
} from "../use-home-settings";

/**
 * Audit 2026-09-17 P2.2 — the storefront reads the published homepage row
 * through a shared store: ONE fetch for every consumer on the page, no
 * staff-session probe, no Supabase browser client on the import graph.
 */

afterEach(() => {
  cleanup();
  __resetHomeSettings();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => {});

function Consumer({ label }: { label: string }) {
  const { settings, loading } = useHomeSettings();
  return (
    <p data-testid={label}>
      {loading ? "loading" : settings.announcement.text}
    </p>
  );
}

describe("useHomeSettings", () => {
  it("fetches /api/homepage once for two consumers and shares the row (default cache mode)", async () => {
    const fetchSpy = vi.fn<(input: string, init?: RequestInit) => Promise<unknown>>(
      async () => ({
        ok: true,
        json: async () => ({
          settings: {
            ...HOME_DEFAULTS,
            announcement: { ...HOME_DEFAULTS.announcement, text: "Eid drop live" },
          },
        }),
      }),
    );
    vi.stubGlobal("fetch", fetchSpy);

    render(
      <>
        <Consumer label="a" />
        <Consumer label="b" />
      </>,
    );
    expect(screen.getByTestId("a").textContent).toBe("loading");
    await flush();
    expect(screen.getByTestId("a").textContent).toBe("Eid drop live");
    expect(screen.getByTestId("b").textContent).toBe("Eid drop live");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    // browser default cache → the CDN copy (s-maxage=60) is reusable
    expect(fetchSpy.mock.calls[0][1]?.cache).toBeUndefined();
  });

  it("falls back to HOME_DEFAULTS when the CMS is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false })));
    render(<Consumer label="a" />);
    await flush();
    expect(screen.getByTestId("a").textContent).toBe(HOME_DEFAULTS.announcement.text);
  });

  it("publishHomeSettings pushes the editor's row to every mounted reader", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ settings: HOME_DEFAULTS }) })),
    );
    render(<Consumer label="a" />);
    await flush();
    act(() => {
      publishHomeSettings({
        ...HOME_DEFAULTS,
        announcement: { ...HOME_DEFAULTS.announcement, text: "Published now" },
      });
    });
    expect(screen.getByTestId("a").textContent).toBe("Published now");
  });

  it("keeps the staff/auth libraries off the storefront import graph", async () => {
    // A static analysis stand-in: the reader module must not import the
    // staff probe or the admin API client (which lazy-load supabase-js).
    const fs = await import("node:fs");
    const path = await import("node:path");
    const read = (rel: string) =>
      fs.readFileSync(path.join(process.cwd(), "src", rel), "utf8");
    const src = read("lib/use-home-settings.ts");
    expect(src).not.toMatch(/use-staff-live|admin-api|admin-auth|supabase-browser/);
    for (const consumer of [
      "app/(site)/page.tsx",
      "components/layout/announcement-bar.tsx",
      "components/account/referral-card.tsx",
    ]) {
      expect(read(consumer), consumer).not.toMatch(
        /from "@\/lib\/(use-cms|admin-api|admin-auth|supabase-browser)"/,
      );
    }
  });
});
