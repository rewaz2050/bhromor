import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit 2026-09-17 P2.6 — `requireStaff()` memoises a POSITIVE admin_users
 * lookup for 60 s per user. Negative results are never cached, a
 * grant/revoke clears the entry, and the TTL expires on its own.
 */

vi.mock("server-only", () => ({}));

const state = {
  role: "admin" as string | null,
  roleReads: 0,
  headerToken: "tok-1" as string | null,
};

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) =>
      name === "authorization" && state.headerToken
        ? `Bearer ${state.headerToken}`
        : null,
  }),
}));

vi.mock("@/lib/env", () => ({
  supabaseUrl: () => "https://x.supabase.co",
  supabaseAnonKey: () => "anon",
}));
vi.mock("../env", () => ({
  supabaseUrl: () => "https://x.supabase.co",
  supabaseAnonKey: () => "anon",
}));

const serviceDb = {
  from: (table: string) => {
    if (table !== "admin_users") throw new Error(`unexpected table ${table}`);
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            state.roleReads += 1;
            return {
              data: state.role ? { role: state.role } : null,
              error: null,
            };
          },
        }),
      }),
    };
  },
};

vi.mock("../supabase-server", () => ({
  getSupabaseServer: async () => null,
  getSupabaseService: () => serviceDb,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => ({
        data: { user: { id: `user-${token}` } },
        error: null,
      }),
    },
  }),
}));

import { forgetStaffRole, requireStaff, StaffAuthError } from "../staff-auth";

beforeEach(() => {
  state.role = "admin";
  state.roleReads = 0;
  state.headerToken = "tok-1";
  forgetStaffRole();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-17T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("requireStaff role memo", () => {
  it("reads admin_users once per user per minute, not once per request", async () => {
    const a = await requireStaff();
    const b = await requireStaff();
    const c = await requireStaff();
    expect([a.role, b.role, c.role]).toEqual(["admin", "admin", "admin"]);
    expect(state.roleReads).toBe(1);
  });

  it("re-reads after the TTL expires", async () => {
    await requireStaff();
    vi.setSystemTime(new Date("2026-09-17T10:01:01Z"));
    state.role = "manager";
    const ctx = await requireStaff();
    expect(ctx.role).toBe("manager");
    expect(state.roleReads).toBe(2);
  });

  it("never caches a negative answer — a non-staff user is checked every time", async () => {
    state.role = null;
    await expect(requireStaff()).rejects.toBeInstanceOf(StaffAuthError);
    await expect(requireStaff()).rejects.toBeInstanceOf(StaffAuthError);
    expect(state.roleReads).toBe(2);
    // ...and the moment a row appears, the gate opens.
    state.role = "admin";
    await expect(requireStaff()).resolves.toMatchObject({ role: "admin" });
  });

  it("forgetStaffRole(id) makes a revoke bite on the very next request", async () => {
    await requireStaff();
    state.role = null;
    // Still cached (within the TTL) …
    await expect(requireStaff()).resolves.toMatchObject({ role: "admin" });
    // … until the revoke path clears it.
    forgetStaffRole("user-tok-1");
    await expect(requireStaff()).rejects.toMatchObject({ status: 403 });
  });

  it("memo is per user — a second staffer gets their own lookup", async () => {
    await requireStaff();
    state.headerToken = "tok-2";
    state.role = "manager";
    const other = await requireStaff();
    expect(other.role).toBe("manager");
    expect(state.roleReads).toBe(2);
    // and the first user is still served from the memo
    state.headerToken = "tok-1";
    await expect(requireStaff()).resolves.toMatchObject({ role: "admin" });
    expect(state.roleReads).toBe(2);
  });
});
