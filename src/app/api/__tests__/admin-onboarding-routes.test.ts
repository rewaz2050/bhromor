/**
 * Admin onboarding routes (apply = sign up, 2026-09-26): pending counts for
 * the badge/banner, and staff password resets that hand back a temporary
 * password once — the e-mail-free answer to "I forgot my password".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  vendorOwner: [{ user_id: "vendor-user-1" }] as { user_id: string }[] | null,
  rider: { user_id: "rider-user-1" } as { user_id: string | null } | null,
  counts: { shops: 3, riders: 1 },
  service: null as null | { auth: { admin: { updateUserById: ReturnType<typeof vi.fn> } } },
  routeOpts: [] as unknown[],
}));

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => state.service,
}));

vi.mock("../admin/_lib", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../admin/_lib")>();
  const db = {
    from: (table: string) => {
      const chain = {
        select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.head) {
            return {
              eq: async () => ({
                count: table === "shops" ? state.counts.shops : state.counts.riders,
                error: null,
              }),
            };
          }
          return chain;
        },
        eq: () => chain,
        limit: async () => ({ data: state.vendorOwner, error: null }),
        maybeSingle: async () => ({ data: state.rider, error: null }),
      };
      return chain;
    },
  };
  return {
    ...orig,
    staffRoute: (
      _name: string,
      handler: (ctx: unknown, req: Request, routeCtx?: unknown) => unknown,
      opts?: unknown,
    ) => {
      state.routeOpts.push(opts);
      return (req: Request, routeCtx?: unknown) => handler({ db }, req, routeCtx);
    },
  };
});

import { GET as pendingGet } from "../admin/applications/route";
import { POST as shopReset } from "../admin/shops/[id]/reset-password/route";
import { POST as riderReset } from "../admin/riders/[id]/reset-password/route";
import { AdminInputError } from "@/lib/db/admin";

const post = (path: string): Request => new Request(`http://localhost${path}`, { method: "POST" });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  state.vendorOwner = [{ user_id: "vendor-user-1" }];
  state.rider = { user_id: "rider-user-1" };
  state.service = { auth: { admin: { updateUserById: vi.fn(async () => ({ error: null })) } } };
});

describe("GET /api/admin/applications", () => {
  it("answers the two pending head-counts", async () => {
    const res = await pendingGet(new Request("http://localhost/api/admin/applications"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ shops: 3, riders: 1 });
  });
});

describe("POST /api/admin/shops/[id]/reset-password", () => {
  it("sets a temporary password on the owner login and returns it once", async () => {
    const res = await shopReset(post("/api/admin/shops/s1/reset-password"), ctx("s1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { password: string };
    expect(body.password).toMatch(/^[a-z2-9]{3}-[a-z2-9]{3}-[a-z2-9]{3}$/);
    const update = state.service!.auth.admin.updateUserById;
    expect(update).toHaveBeenCalledWith("vendor-user-1", { password: body.password });
  });

  it("404s a shop without a vendor login instead of creating one", async () => {
    state.vendorOwner = [];
    await expect(shopReset(post("/api/admin/shops/s1/reset-password"), ctx("s1"))).rejects.toMatchObject({
      status: 404,
    });
    expect(state.service!.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it("503s without a service key", async () => {
    state.service = null;
    await expect(shopReset(post("/api/admin/shops/s1/reset-password"), ctx("s1"))).rejects.toBeInstanceOf(
      AdminInputError,
    );
  });
});

describe("POST /api/admin/riders/[id]/reset-password", () => {
  it("resets the rider's login password", async () => {
    const res = await riderReset(post("/api/admin/riders/r1/reset-password"), ctx("r1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { password: string };
    expect(state.service!.auth.admin.updateUserById).toHaveBeenCalledWith("rider-user-1", {
      password: body.password,
    });
  });

  it("404s a rider row that has no login", async () => {
    state.rider = { user_id: null };
    await expect(riderReset(post("/api/admin/riders/r1/reset-password"), ctx("r1"))).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("route guards", () => {
  it("restricts both resets to admin / super_admin with a tight limit", () => {
    const resetOpts = state.routeOpts.filter(
      (o): o is { limit: number; roles: string[] } => typeof o === "object" && o !== null && "roles" in o,
    );
    expect(resetOpts).toHaveLength(2);
    for (const o of resetOpts) {
      expect(o.roles).toEqual(["admin", "super_admin"]);
      expect(o.limit).toBeLessThanOrEqual(10);
    }
  });
});
