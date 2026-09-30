/**
 * C1 (2026-09-28) — the staff endpoints' gate and shape.
 *
 * The interesting question is not "does it work" (the data layer is tested on
 * its own) but "who may": a shop's roster is the owner's business, a staff
 * login must not be able to add anybody, and the endpoints that hand out
 * credentials are the most tightly rate-limited in the vendor API.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  /** Never cleared: the routes call vendorRoute at import time. */
  allOpts: [] as ({ limit?: number } | undefined)[],
  role: "owner" as "owner" | "staff",
  rows: [] as Record<string, unknown>[],
  listError: null as { message: string } | null,
  deletes: [] as Array<{ shopId: string; userId: string; role: string }>,
  deleteRows: [{ user_id: "staff-1" }] as Record<string, unknown>[],
  created: [] as { email: string; password: string }[],
  existing: [] as { id: string; email: string }[],
  passwordSets: [] as string[],
  deletedAccounts: [] as string[],
  service: null as unknown,
}));

const rosterChain = () => {
  const filters: Record<string, unknown> = {};
  const obj: Record<string, unknown> = { error: null };
  let single = false;
  const matches = () =>
    state.rows.filter((r) =>
      Object.entries(filters).every(([col, val]) => String(r[col]) === String(val)),
    );
  Object.defineProperty(obj, "data", { get: () => (single ? (matches()[0] ?? null) : matches()) });
  obj.select = () => obj;
  obj.eq = (col: string, val: unknown) => {
    filters[col] = val;
    return obj;
  };
  obj.order = () => obj;
  obj.single = () => {
    single = true;
    return obj;
  };
  obj.maybeSingle = () => {
    single = true;
    return obj;
  };
  if (state.listError) obj.error = state.listError;
  return obj;
};

const db = {
  from: (table: string) => {
    if (table !== "vendor_users") return { select: () => rosterChain() };
    return {
      select: () => rosterChain(),
      insert: (values: Record<string, unknown>) => ({
        select: () => ({
          single: async () => ({
            data: { ...values, created_at: "2026-09-28T12:00:00.000Z" },
            error: null,
          }),
        }),
      }),
      delete: () => {
        const obj: Record<string, unknown> = {};
        const seen: Record<string, unknown> = {};
        obj.eq = (col: string, val: unknown) => {
          seen[col] = val;
          return obj;
        };
        obj.select = async () => {
          state.deletes.push({
            shopId: String(seen.shop_id ?? ""),
            userId: String(seen.user_id ?? ""),
            role: String(seen.role ?? ""),
          });
          return { data: state.deleteRows, error: null };
        };
        return obj;
      },
    };
  },
};

const service = {
  auth: {
    admin: {
      listUsers: async () => ({
        data: { users: state.existing.map((u) => ({ id: u.id, email: u.email })) },
        error: null,
      }),
      createUser: async (input: { email: string; password: string }) => {
        state.created.push({ email: input.email, password: input.password });
        return { data: { user: { id: "new-staff", email: input.email } }, error: null };
      },
      updateUserById: async (userId: string, values: { password: string }) => {
        state.passwordSets.push(values.password);
        return { data: { user: { id: userId } }, error: null };
      },
      deleteUser: async (userId: string) => {
        state.deletedAccounts.push(userId);
        return { data: null, error: null };
      },
    },
  },
};

vi.mock("../vendor/_lib", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../vendor/_lib")>();
  return {
    ...orig,
    routeId: orig.routeId,
    vendorRoute: (
      _name: string,
      handler: (ctx: unknown, req: Request, routeCtx?: unknown) => unknown,
      opts?: { limit?: number },
    ) => {
      state.allOpts.push(opts);
      return (req: Request, routeCtx?: unknown) =>
        handler(
          {
            db,
            user: { id: "owner-1", email: "owner@shop.test" },
            shopId: "shop-1",
            role: state.role,
          },
          req,
          routeCtx,
        );
    },
  };
});

vi.mock("@/lib/supabase-server", () => ({
  getSupabaseService: () => service,
  getSupabaseServer: () => null,
  getSupabaseAnon: () => null,
}));

import { GET as list, POST as create } from "@/app/api/vendor/staff/route";
import { DELETE as revoke } from "@/app/api/vendor/staff/[id]/route";
import { POST as resetPassword } from "@/app/api/vendor/staff/[id]/password/route";

const OWNER_ROW = {
  user_id: "owner-1",
  shop_id: "shop-1",
  role: "owner",
  created_at: "2026-09-01T00:00:00.000Z",
  display_name: "Nasreen",
  login_email: "owner@shop.test",
  added_by: null,
};
const STAFF_ROW = {
  user_id: "staff-1",
  shop_id: "shop-1",
  role: "staff",
  created_at: "2026-09-20T00:00:00.000Z",
  display_name: "Samina",
  login_email: "01711111111@phone.prosanti.app",
  added_by: "owner-1",
};

const post = (body: unknown): Request =>
  new Request("http://localhost/api/vendor/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = (id = "staff-1") => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  state.role = "owner";
  state.rows = [OWNER_ROW, STAFF_ROW];
  state.listError = null;
  state.deletes = [];
  state.deleteRows = [{ user_id: "staff-1" }];
  state.created = [];
  state.existing = [];
  state.passwordSets = [];
  state.deletedAccounts = [];
});

describe("GET /api/vendor/staff", () => {
  it("answers with the roster and whether the caller may manage it", async () => {
    const res = await list(new Request("http://localhost/api/vendor/staff"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { staff: unknown[]; canManage: boolean; self: string };
    expect(body.staff).toHaveLength(2);
    expect(body.canManage).toBe(true);
    expect(body.self).toBe("owner-1");
  });

  it("403s a staff login — the roster is the owner's business", async () => {
    state.role = "staff";
    await expect(list(new Request("http://localhost/api/vendor/staff"))).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("POST /api/vendor/staff", () => {
  it("opens a login and answers 201 with the one-time password", async () => {
    const res = await create(post({ name: "Rafiq", login: "01712345678" }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { staff: { name: string }; password: string };
    expect(body.staff.name).toBe("Rafiq");
    expect(body.password).toMatch(/^[a-z2-9]{3}-[a-z2-9]{3}-[a-z2-9]{3}$/);
    expect(state.created[0].email).toBe("01712345678@phone.prosanti.app");
  });

  it("403s a staff caller before any account is created", async () => {
    state.role = "staff";
    await expect(create(post({ name: "Rafiq", login: "01712345678" }))).rejects.toMatchObject({
      status: 403,
    });
    expect(state.created).toHaveLength(0);
  });

  it("422s a body that is not a name and a login", async () => {
    await expect(create(post({ name: "R", login: "01712345678" }))).rejects.toMatchObject({
      status: 422,
    });
    await expect(create(post(null))).rejects.toMatchObject({ status: 422 });
    expect(state.created).toHaveLength(0);
  });

  it("is the most tightly limited write in the vendor API — it creates accounts", async () => {
    expect(state.allOpts.filter((o) => o?.limit === 5).length).toBeGreaterThanOrEqual(1);
  });
});

describe("DELETE /api/vendor/staff/[id]", () => {
  it("revokes the shop's access, and only a staff row", async () => {
    const res = await revoke(new Request("http://localhost/api/vendor/staff/staff-1", { method: "DELETE" }), ctx());
    expect(res.status).toBe(200);
    expect(state.deletes[0]).toEqual({ shopId: "shop-1", userId: "staff-1", role: "staff" });
  });

  it("403s a staff caller", async () => {
    state.role = "staff";
    await expect(
      revoke(new Request("http://localhost/api/vendor/staff/staff-1", { method: "DELETE" }), ctx()),
    ).rejects.toMatchObject({ status: 403 });
    expect(state.deletes).toHaveLength(0);
  });

  it("400s a missing id instead of guessing", async () => {
    const res = await revoke(new Request("http://localhost/api/vendor/staff/x", { method: "DELETE" }), {
      params: Promise.resolve({ id: "" }),
    });
    expect(res.status).toBe(400);
    expect(state.deletes).toHaveLength(0);
  });
});

describe("POST /api/vendor/staff/[id]/password", () => {
  it("hands over a fresh one-time password", async () => {
    const res = await resetPassword(
      new Request("http://localhost/api/vendor/staff/staff-1/password", { method: "POST" }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { password: string; staff: { name: string } };
    expect(body.password).toMatch(/^[a-z2-9]{3}-[a-z2-9]{3}-[a-z2-9]{3}$/);
    expect(body.staff.name).toBe("Samina");
    expect(state.passwordSets).toHaveLength(1);
  });

  it("refuses to reset an owner's password — that is the admin panel's job", async () => {
    await expect(
      resetPassword(
        new Request("http://localhost/api/vendor/staff/owner-1/password", { method: "POST" }),
        ctx("owner-1"),
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(state.passwordSets).toHaveLength(0);
  });

  it("403s a staff caller", async () => {
    state.role = "staff";
    await expect(
      resetPassword(
        new Request("http://localhost/api/vendor/staff/staff-1/password", { method: "POST" }),
        ctx(),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
