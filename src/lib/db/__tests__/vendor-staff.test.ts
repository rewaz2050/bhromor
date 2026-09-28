/**
 * C1 (2026-09-28) — opening, revoking and re-opening a staff login.
 *
 * The database enforces the rules too (policies + trigger), so what is pinned
 * here is the part the SHOP reads: refusing without half-doing it. A refused
 * attempt must not leave an auth account behind, a revoked login must not take
 * the person's account with it, and an e-mail that already belongs to somebody
 * else is never adopted into this shop.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  roster: [] as Record<string, unknown>[],
  /** Ids the auth table already knows about. */
  authUsers: [] as { id: string; email: string }[],
  createError: null as { message: string } | null,
  listUsersError: null as { message: string } | null,
  linkError: null as { message: string; code?: string } | null,
  readError: null as { message: string } | null,
  deleteRows: null as Record<string, unknown>[] | null,
  inserts: [] as Record<string, unknown>[],
  deletes: [] as Array<{ shopId: string; userId: string; role: string }>,
  deletedAccounts: [] as string[],
  passwordSets: [] as { userId: string; password: string }[],
  filters: [] as [string, unknown][],
}));

const chain = (data: unknown, error: unknown = null) => {
  const obj: Record<string, unknown> = { data, error };
  obj.select = () => obj;
  obj.eq = (col: string, val: unknown) => {
    state.filters.push([col, val]);
    return obj;
  };
  obj.order = () => obj;
  obj.single = () => obj;
  obj.maybeSingle = () => obj;
  return obj;
};

/**
 * A select chain whose `data` is a getter, so the filters applied AFTER the
 * chain object exists (`.eq(...).eq(...)`) still shape the answer — and
 * `maybeSingle()` collapses it to one row the way PostgREST does.
 */
const rosterChain = () => {
  const filters: Record<string, unknown> = {};
  const obj: Record<string, unknown> = { error: null };
  let single = false;
  const matches = () =>
    state.roster.filter((r) =>
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
  if (state.readError) obj.error = state.readError;
  return obj;
};

const fakeDb = (): SupabaseClient =>
  ({
    from: (table: string) => {
      if (table !== "vendor_users") return { select: () => chain([]) };
      return {
        select: () => rosterChain(),
        insert: (values: Record<string, unknown>) => {
          state.inserts.push(values);
          if (state.linkError) return chain(null, state.linkError);
          return chain({ ...values, created_at: "2026-09-28T12:00:00.000Z" });
        },
        delete: () => {
          const obj: Record<string, unknown> = {
            data: state.deleteRows ?? [],
            error: null,
          };
          const seen: Record<string, unknown> = {};
          obj.eq = (col: string, val: unknown) => {
            seen[col] = val;
            return obj;
          };
          obj.select = () => {
            state.deletes.push({
              shopId: String(seen.shop_id ?? ""),
              userId: String(seen.user_id ?? ""),
              role: String(seen.role ?? ""),
            });
            return Promise.resolve(obj);
          };
          return obj;
        },
      };
    },
  }) as unknown as SupabaseClient;

const fakeService = (): SupabaseClient =>
  ({
    auth: {
      admin: {
        listUsers: async () => {
          if (state.listUsersError) return { data: null, error: state.listUsersError };
          return {
            data: { users: state.authUsers.map((u) => ({ id: u.id, email: u.email })) },
            error: null,
          };
        },
        createUser: async (input: { email: string }) => {
          if (state.createError) return { data: null, error: state.createError };
          return { data: { user: { id: `new-${state.authUsers.length + 1}`, email: input.email } }, error: null };
        },
        updateUserById: async (userId: string, values: { password: string }) => {
          state.passwordSets.push({ userId, password: values.password });
          return { data: { user: { id: userId } }, error: null };
        },
        deleteUser: async (userId: string) => {
          state.deletedAccounts.push(userId);
          return { data: null, error: null };
        },
      },
    },
  }) as unknown as SupabaseClient;

const OWNER = "owner-1";
const SHOP = "shop-1";
const row = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  user_id: OWNER,
  shop_id: SHOP,
  role: "owner",
  created_at: "2026-09-01T00:00:00.000Z",
  display_name: "Owner",
  login_email: "owner@shop.test",
  added_by: null,
  ...over,
});

import {
  createVendorStaff,
  findAuthUserIdByEmail,
  listVendorStaff,
  resetVendorStaffPassword,
  revokeVendorStaff,
} from "@/lib/db/vendor-staff";

beforeEach(() => {
  state.roster = [row()];
  state.authUsers = [{ id: OWNER, email: "owner@shop.test" }];
  state.createError = null;
  state.listUsersError = null;
  state.linkError = null;
  state.readError = null;
  state.deleteRows = [{ user_id: "staff-1" }];
  state.inserts = [];
  state.deletes = [];
  state.deletedAccounts = [];
  state.passwordSets = [];
  state.filters = [];
});

const create = (raw: unknown, role: "owner" | "staff" = "owner") =>
  createVendorStaff({
    service: fakeService(),
    db: fakeDb(),
    shopId: SHOP,
    role,
    ownerUserId: OWNER,
    raw,
  });

describe("listVendorStaff", () => {
  it("names the people who can open the shop, owner first", async () => {
    state.roster = [
      row(),
      row({ user_id: "staff-1", role: "staff", display_name: "Samina", login_email: "01711111111@phone.prosanti.app" }),
    ];
    const list = await listVendorStaff(fakeDb(), SHOP, "owner", OWNER);
    expect(list.map((m) => m.role)).toEqual(["owner", "staff"]);
    expect(list[1]).toMatchObject({ name: "Samina", handle: "01711111111" });
    expect(list[0].isYou).toBe(true);
    expect(list[1].isYou).toBeUndefined();
  });

  it("refuses a staff login — the roster is the owner's to read", async () => {
    await expect(listVendorStaff(fakeDb(), SHOP, "staff", "staff-1")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("names a row that predates the migration rather than leaving it blank", async () => {
    state.roster = [row({ display_name: null, login_email: null, role: "staff" })];
    const list = await listVendorStaff(fakeDb(), SHOP, "owner", OWNER);
    expect(list[0].name).toBe("Shop staff");
  });
});

describe("createVendorStaff", () => {
  it("opens a login with a one-time password, and records who opened it", async () => {
    const result = await create({ name: "Samina", login: "01712345678" });
    expect(result.staff).toMatchObject({
      name: "Samina",
      role: "staff",
      handle: "01712345678",
      loginEmail: "01712345678@phone.prosanti.app",
    });
    expect(result.password).toMatch(/^[a-z2-9]{3}-[a-z2-9]{3}-[a-z2-9]{3}$/);
    expect(state.inserts[0]).toMatchObject({
      shop_id: SHOP,
      role: "staff",
      added_by: OWNER,
      display_name: "Samina",
    });
  });

  it("refuses a staff caller", async () => {
    await expect(create({ name: "Samina", login: "01712345678" }, "staff")).rejects.toMatchObject({
      status: 403,
    });
    expect(state.inserts).toHaveLength(0);
  });

  it("refuses a bad name or login with 422 and touches nothing", async () => {
    await expect(create({ name: "S", login: "01712345678" })).rejects.toMatchObject({ status: 422 });
    await expect(create({ name: "Samina", login: "nope" })).rejects.toMatchObject({ status: 422 });
    expect(state.inserts).toHaveLength(0);
  });

  it("refuses to adopt a login that already exists — it may be somebody else's", async () => {
    state.authUsers.push({ id: "someone", email: "01712345678@phone.prosanti.app" });
    await expect(create({ name: "Samina", login: "01712345678" })).rejects.toMatchObject({
      status: 409,
    });
    expect(state.inserts).toHaveLength(0);
  });

  it("refuses the same login twice on this shop", async () => {
    state.roster.push(
      row({ user_id: "staff-1", role: "staff", login_email: "01712345678@phone.prosanti.app" }),
    );
    await expect(create({ name: "Samina", login: "01712345678" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("refuses a sixth login", async () => {
    state.roster = [
      row(),
      ...Array.from({ length: 5 }, (_, i) => row({ user_id: `s${i}`, role: "staff" })),
    ];
    await expect(create({ name: "Samina", login: "01799999999" })).rejects.toMatchObject({
      status: 409,
    });
    expect(state.inserts).toHaveLength(0);
  });

  it("leaves no account behind when the shop link fails", async () => {
    state.linkError = { message: "duplicate key", code: "23505" };
    await expect(create({ name: "Samina", login: "01712345678" })).rejects.toMatchObject({
      status: 409,
    });
    // The account was created first, so it has to be taken back: a login that
    // opens no shop is a stray key.
    expect(state.deletedAccounts).toHaveLength(1);
  });

  it("says 'already has a login' when the auth create reports the collision", async () => {
    state.createError = { message: "User already registered" };
    await expect(create({ name: "Samina", login: "01712345678" })).rejects.toMatchObject({
      status: 409,
    });
  });

  it("surfaces the database's own cap message rather than a 503", async () => {
    state.linkError = { message: "A shop may have at most 5 staff logins — revoke one first." };
    await expect(create({ name: "Samina", login: "01712345678" })).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("revokeVendorStaff", () => {
  it("removes the shop's access and says whose it was", async () => {
    state.roster = [row(), row({ user_id: "staff-1", role: "staff", display_name: "Samina" })];
    state.deleteRows = [{ user_id: "staff-1" }];
    const { revoked } = await revokeVendorStaff(fakeDb(), SHOP, "owner", "staff-1");
    expect(revoked).toMatchObject({ userId: "staff-1", name: "Samina" });
    expect(state.deletes[0]).toEqual({ shopId: SHOP, userId: "staff-1", role: "staff" });
  });

  it("refuses a staff caller", async () => {
    await expect(revokeVendorStaff(fakeDb(), SHOP, "staff", "staff-1")).rejects.toMatchObject({
      status: 403,
    });
    expect(state.deletes).toHaveLength(0);
  });

  it("refuses to revoke an owner", async () => {
    state.roster = [row()];
    await expect(revokeVendorStaff(fakeDb(), SHOP, "owner", OWNER)).rejects.toMatchObject({
      status: 403,
    });
    expect(state.deletes).toHaveLength(0);
  });

  it("says plainly when the login is not on this shop, instead of a false success", async () => {
    state.roster = [row()];
    await expect(revokeVendorStaff(fakeDb(), SHOP, "owner", "ghost")).rejects.toMatchObject({
      status: 404,
    });
  });

  it("reports a refusal the policy made silently (no rows deleted)", async () => {
    state.roster = [row(), row({ user_id: "staff-1", role: "staff" })];
    state.deleteRows = []; // RLS said no
    await expect(revokeVendorStaff(fakeDb(), SHOP, "owner", "staff-1")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("resetVendorStaffPassword", () => {
  it("hands the owner a fresh one-time password and leaves the row alone", async () => {
    state.roster = [row(), row({ user_id: "staff-1", role: "staff", display_name: "Samina" })];
    const { password, staff } = await resetVendorStaffPassword({
      service: fakeService(),
      db: fakeDb(),
      shopId: SHOP,
      role: "owner",
      userId: "staff-1",
    });
    expect(password).toMatch(/^[a-z2-9]{3}-[a-z2-9]{3}-[a-z2-9]{3}$/);
    expect(state.passwordSets[0].userId).toBe("staff-1");
    expect(staff.name).toBe("Samina");
  });

  it("refuses to reset an owner's password — that is the admin panel's job", async () => {
    state.roster = [row()];
    await expect(
      resetVendorStaffPassword({
        service: fakeService(),
        db: fakeDb(),
        shopId: SHOP,
        role: "owner",
        userId: OWNER,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(state.passwordSets).toHaveLength(0);
  });

  it("refuses a staff caller", async () => {
    await expect(
      resetVendorStaffPassword({
        service: fakeService(),
        db: fakeDb(),
        shopId: SHOP,
        role: "staff",
        userId: "staff-1",
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("findAuthUserIdByEmail", () => {
  it("finds the account behind an e-mail, case aside", async () => {
    await expect(findAuthUserIdByEmail(fakeService(), "OWNER@Shop.test")).resolves.toBe(OWNER);
  });

  it("answers null when nobody uses it, and when the lookup itself fails", async () => {
    await expect(findAuthUserIdByEmail(fakeService(), "nobody@shop.test")).resolves.toBeNull();
    state.listUsersError = { message: "down" };
    await expect(findAuthUserIdByEmail(fakeService(), "owner@shop.test")).resolves.toBeNull();
  });
});
