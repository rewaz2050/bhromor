import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { tryAutoLinkRider } from "../rider-auth";

/** Minimal thenable-chain stub for the three queries tryAutoLinkRider runs. */
const stubService = (opts: {
  candidate?: unknown;
  linkError?: unknown;
  linked?: unknown;
  onFrom?: (table: string) => void;
}) => {
  const from = vi.fn((table: string) => {
    opts.onFrom?.(table);
    const terminal = {
      maybeSingle: async () => ({ data: opts.candidate ?? null }),
      single: async () => ({ data: opts.linked ?? null }),
    };
    const chain: Record<string, unknown> = {};
    for (const key of ["select", "ilike", "is", "neq", "order", "limit", "eq", "update"]) {
      chain[key] = vi.fn(() => chain);
    }
    Object.assign(chain, terminal);
    // update() starts a fresh chain ending in eq().is() → { error }
    (chain.update as ReturnType<typeof vi.fn>).mockImplementation(() => ({
      eq: () => ({ is: async () => ({ error: opts.linkError ?? null }) }),
    }));
    return chain;
  });
  return { from } as unknown as Parameters<typeof tryAutoLinkRider>[0];
};

describe("tryAutoLinkRider (apply-before-signup)", () => {
  it("ignores blank/invalid login emails without touching the database", async () => {
    const onFrom = vi.fn();
    for (const email of ["", "not-an-email", "a@b"]) {
      const out = await tryAutoLinkRider(stubService({ onFrom }), "user-1", email);
      expect(out).toBeNull();
    }
    expect(onFrom).not.toHaveBeenCalled();
  });

  it("returns null when no anonymous application owns the email", async () => {
    const out = await tryAutoLinkRider(
      stubService({ candidate: null }),
      "user-1",
      "rider@example.com",
    );
    expect(out).toBeNull();
  });

  it("links the anonymous application and returns the linked row", async () => {
    const row = { id: "rider-1", user_id: "user-1", contact_email: "rider@example.com" };
    const out = await tryAutoLinkRider(
      stubService({
        candidate: { id: "rider-1", user_id: null },
        linked: row,
      }),
      "user-1",
      "Rider@Example.com",
    );
    expect(out).toEqual(row);
  });

  it("returns null when the link races (row claimed by another login)", async () => {
    const out = await tryAutoLinkRider(
      stubService({
        candidate: { id: "rider-1", user_id: null },
        linkError: new Error("0 rows"),
      }),
      "user-1",
      "rider@example.com",
    );
    expect(out).toBeNull();
  });
});
