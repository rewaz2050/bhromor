/**
 * Apply = sign up (2026-09-26).
 *
 * A shop or rider application carries the login password; the intake
 * creates the account, the pending row and the link in one go — and undoes
 * the account when the row cannot be written, so a failed submit never
 * leaves a stray login behind. Staff approval (status → active) is the
 * only gate afterwards.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Responder = (table: string, ops: string[], payload: unknown) => { data?: unknown; error?: unknown };

const state = vi.hoisted(() => ({
  calls: [] as { table: string; op: string; args: unknown[] }[],
  respond: (() => ({ data: null, error: null })) as (
    table: string,
    ops: string[],
    payload: unknown,
  ) => { data?: unknown; error?: unknown },
  createAccount: vi.fn(),
  deleteAccount: vi.fn(),
}));

const fakeDb = () => ({
  from: (table: string) => {
    const ops: string[] = [];
    let payload: unknown;
    const builder: Record<string, unknown> = {};
    for (const op of ["select", "eq", "neq", "not", "in", "or", "limit", "insert", "update", "delete", "single", "maybeSingle"]) {
      builder[op] = (...args: unknown[]) => {
        ops.push(op);
        if (op === "insert" || op === "update") payload = args[0];
        state.calls.push({ table, op, args });
        return builder;
      };
    }
    builder.then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) => Promise.resolve(state.respond(table, ops, payload)).then(resolve, reject);
    return builder;
  },
});

vi.mock("../../supabase-server", () => ({
  getSupabaseService: () => fakeDb(),
  getSupabaseAnon: () => null,
}));

vi.mock("../applicant-account", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../applicant-account")>();
  return {
    ...actual,
    createApplicantAccount: (...args: unknown[]) => state.createAccount(...args),
    deleteApplicantAccount: (...args: unknown[]) => state.deleteAccount(...args),
  };
});

import { ApplicantAccountError } from "../applicant-account";
import { ShopInputError, applyShop } from "../marketplace";
import { RiderInputError, applyRider } from "../riders";

const ZONES = { data: [{ id: "z1", active: true }, { id: "z2", active: false }], error: null };

const shopHappy: Responder = (table, ops, payload) => {
  if (table === "delivery_zones") return ZONES;
  if (table === "shops" && ops.includes("insert")) {
    return { data: { id: "shop-1", ...(payload as object) }, error: null };
  }
  if (table === "shops" && ops.includes("delete")) return { data: null, error: null };
  if (table === "shops") return { data: [], error: null };
  if (table === "vendor_users" && ops.includes("insert")) return { data: null, error: null };
  if (table === "vendor_users") return { data: [], error: null };
  return { data: null, error: null };
};

const riderHappy: Responder = (table, ops, payload) => {
  if (table === "delivery_zones") return ZONES;
  if (table === "riders" && ops.includes("insert")) {
    return { data: { id: "rider-1", ...(payload as object) }, error: null };
  }
  if (table === "riders") return { data: [], error: null };
  return { data: null, error: null };
};

const SHOP = {
  name: "Arian Fashion",
  tagline: "Premium panjabi",
  phone: "017 1234-5678",
  contactEmail: "Shop@Example.com",
  address: "Kandirpar, Cumilla",
  prepMinutes: 20,
  zoneIds: ["z1"],
};

const RIDER = {
  name: "Tanvir Ahmed",
  phone: "01811111111",
  contactEmail: "Rider@Example.com",
  vehicle: "bike",
  zoneIds: ["z1"],
};

const inserted = (table: string) =>
  state.calls.find((c) => c.table === table && c.op === "insert")?.args[0] as
    | Record<string, unknown>
    | undefined;

beforeEach(() => {
  state.calls = [];
  state.createAccount.mockReset();
  state.deleteAccount.mockReset();
  state.createAccount.mockResolvedValue({ userId: "u-new", created: true });
  state.deleteAccount.mockResolvedValue(undefined);
});

describe("applyShop — apply = sign up", () => {
  it("refuses an application without a password before touching anything", async () => {
    state.respond = shopHappy;
    await expect(applyShop(SHOP, {})).rejects.toBeInstanceOf(ApplicantAccountError);
    await expect(applyShop(SHOP, { password: "abc" })).rejects.toMatchObject({ status: 400 });
    expect(state.calls).toEqual([]);
    expect(state.createAccount).not.toHaveBeenCalled();
  });

  it("creates the login, the pending shop and the owner link together", async () => {
    state.respond = shopHappy;
    const result = await applyShop(SHOP, { password: "secret1" });

    expect(result).toEqual({
      id: "shop-1",
      userId: "u-new",
      accountCreated: true,
      loginEmail: "shop@example.com",
      resubmitted: false,
    });
    expect(state.createAccount).toHaveBeenCalledWith(
      expect.anything(),
      { email: "shop@example.com", password: "secret1", name: "Arian Fashion", kind: "vendor" },
    );
    expect(inserted("shops")).toMatchObject({
      name: "Arian Fashion",
      tagline: "Premium panjabi",
      phone: "01712345678",
      contact_email: "shop@example.com",
      prep_minutes: 20,
      status: "pending",
      is_open: false,
      zone_ids: ["z1"],
    });
    expect(inserted("vendor_users")).toEqual({ user_id: "u-new", shop_id: "shop-1", role: "owner" });
    expect(state.deleteAccount).not.toHaveBeenCalled();
  });

  it("rejects a duplicate application email before creating any login", async () => {
    state.respond = (table, ops, payload) => {
      if (table === "shops" && ops.includes("not")) {
        return { data: [{ id: "shop-0", status: "pending", contact_email: "shop@example.com" }], error: null };
      }
      return shopHappy(table, ops, payload);
    };
    await expect(applyShop(SHOP, { password: "secret1" })).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/email already has a shop application/),
    });
    expect(state.createAccount).not.toHaveBeenCalled();
    expect(inserted("shops")).toBeUndefined();
  });

  it("rejects a duplicate shop phone under a different email", async () => {
    state.respond = (table, ops, payload) => {
      if (table === "shops" && ops.includes("not")) {
        return { data: [{ id: "shop-0", status: "active", contact_email: "other@example.com" }], error: null };
      }
      return shopHappy(table, ops, payload);
    };
    await expect(applyShop(SHOP, { password: "secret1" })).rejects.toMatchObject({
      status: 409,
      message: expect.stringMatching(/phone number already belongs/),
    });
    const dupeCall = state.calls.find((c) => c.table === "shops" && c.op === "or");
    expect(dupeCall?.args[0]).toBe("contact_email.eq.shop@example.com,phone.eq.01712345678");
    // Round 4 — suspended AND rejected rows are out of the duplicate check.
    const notCall = state.calls.find((c) => c.table === "shops" && c.op === "not");
    expect(notCall?.args).toEqual(["status", "in", "(suspended,rejected)"]);
    expect(state.createAccount).not.toHaveBeenCalled();
  });

  it("re-applies over this login's REJECTED shop instead of refusing (round 4)", async () => {
    state.createAccount.mockResolvedValue({ userId: "u-old", created: false });
    state.respond = (table, ops, payload) => {
      if (table === "vendor_users" && ops.includes("select")) return { data: [{ shop_id: "shop-7" }], error: null };
      if (table === "shops" && ops.includes("maybeSingle")) return { data: { id: "shop-7", status: "rejected" }, error: null };
      if (table === "shops" && ops.includes("update")) return { data: null, error: null };
      return shopHappy(table, ops, payload);
    };
    const result = await applyShop({ ...SHOP, name: "Arian Fashion House" }, { password: "secret1" });
    expect(result).toEqual({
      id: "shop-7",
      userId: "u-old",
      accountCreated: false,
      loginEmail: "shop@example.com",
      resubmitted: true,
    });
    const update = state.calls.find((c) => c.table === "shops" && c.op === "update");
    expect(update?.args[0]).toMatchObject({
      name: "Arian Fashion House",
      status: "pending",
      is_open: false,
      review_note: null,
      reviewed_by: null,
      reviewed_at: null,
    });
    // The update is fenced to the rejected row — a race with an approval never downgrades an active shop.
    const fences = state.calls.filter((c) => c.table === "shops" && c.op === "eq").map((c) => c.args);
    expect(fences).toContainEqual(["status", "rejected"]);
    expect(inserted("shops")).toBeUndefined();
    expect(state.deleteAccount).not.toHaveBeenCalled();
  });

  it("gives a phone-only application a synthetic login e-mail (round 4)", async () => {
    state.respond = shopHappy;
    const { contactEmail: _omit, ...noEmail } = SHOP;
    void _omit;
    const result = await applyShop(noEmail, { password: "secret1" });
    expect(state.createAccount).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: "01712345678@phone.prosanti.app" }),
    );
    expect(result.loginEmail).toBe("01712345678@phone.prosanti.app");
    expect(inserted("shops")).toMatchObject({ contact_email: "01712345678@phone.prosanti.app" });
  });

  it("still rejects a typed e-mail that is not one", async () => {
    state.respond = shopHappy;
    await expect(applyShop({ ...SHOP, contactEmail: "not-an-email" }, { password: "secret1" })).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/leave it empty/),
    });
    expect(state.createAccount).not.toHaveBeenCalled();
  });

  it("deletes the fresh login when the shop row cannot be written", async () => {
    state.respond = (table, ops, payload) => {
      if (table === "shops" && ops.includes("insert")) return { data: null, error: { message: "boom" } };
      return shopHappy(table, ops, payload);
    };
    await expect(applyShop(SHOP, { password: "secret1" })).rejects.toThrow("shop application failed");
    expect(state.deleteAccount).toHaveBeenCalledWith(expect.anything(), "u-new");
  });

  it("removes the shop row and the fresh login when the owner link fails", async () => {
    state.respond = (table, ops, payload) => {
      if (table === "vendor_users" && ops.includes("insert")) return { data: null, error: { code: "42501", message: "denied" } };
      return shopHappy(table, ops, payload);
    };
    await expect(applyShop(SHOP, { password: "secret1" })).rejects.toThrow("shop application link failed");
    expect(state.calls.some((c) => c.table === "shops" && c.op === "delete")).toBe(true);
    expect(state.deleteAccount).toHaveBeenCalledWith(expect.anything(), "u-new");
  });

  it("keeps a reused login but refuses it when it already runs a shop", async () => {
    state.createAccount.mockResolvedValue({ userId: "u-old", created: false });
    state.respond = (table, ops, payload) => {
      if (table === "vendor_users" && ops.includes("select")) return { data: [{ shop_id: "shop-9" }], error: null };
      return shopHappy(table, ops, payload);
    };
    await expect(applyShop(SHOP, { password: "secret1" })).rejects.toMatchObject({ status: 409 });
    expect(inserted("shops")).toBeUndefined();
    // Not ours to delete — the login existed before this application.
    expect(state.deleteAccount).not.toHaveBeenCalled();
  });

  it("links a signed-in applicant without creating a login (legacy two-step)", async () => {
    state.respond = shopHappy;
    const result = await applyShop(SHOP, { applicantUserId: "u-session" });
    expect(result).toEqual({
      id: "shop-1",
      userId: "u-session",
      accountCreated: false,
      loginEmail: "shop@example.com",
      resubmitted: false,
    });
    expect(state.createAccount).not.toHaveBeenCalled();
    expect(inserted("vendor_users")).toMatchObject({ user_id: "u-session" });
  });

  it("links the session when its email is the application email, even with a password", async () => {
    state.respond = shopHappy;
    const result = await applyShop(SHOP, {
      applicantUserId: "u-session",
      applicantEmail: "Shop@example.com",
      password: "secret1",
    });
    expect(result.userId).toBe("u-session");
    expect(state.createAccount).not.toHaveBeenCalled();
  });

  it("uses the form's credentials when a different account is signed in", async () => {
    state.respond = shopHappy;
    const result = await applyShop(SHOP, {
      applicantUserId: "u-staff",
      applicantEmail: "admin@prosanti.example",
      password: "secret1",
    });
    expect(result).toMatchObject({ id: "shop-1", userId: "u-new", accountCreated: true });
    expect(inserted("vendor_users")).toMatchObject({ user_id: "u-new" });
  });

  it("still validates the shop fields first", async () => {
    state.respond = shopHappy;
    await expect(applyShop({ ...SHOP, phone: "123" }, { password: "secret1" })).rejects.toBeInstanceOf(
      ShopInputError,
    );
    expect(state.createAccount).not.toHaveBeenCalled();
  });
});

describe("applyRider — apply = sign up", () => {
  it("refuses an application without a password before touching anything", async () => {
    state.respond = riderHappy;
    await expect(applyRider(RIDER, {})).rejects.toBeInstanceOf(ApplicantAccountError);
    expect(state.calls).toEqual([]);
    expect(state.createAccount).not.toHaveBeenCalled();
  });

  it("creates the login and the pending rider row linked to it", async () => {
    state.respond = riderHappy;
    const result = await applyRider(RIDER, { password: "secret1" });

    expect(result).toEqual({
      id: "rider-1",
      userId: "u-new",
      accountCreated: true,
      loginEmail: "rider@example.com",
      resubmitted: false,
    });
    expect(state.createAccount).toHaveBeenCalledWith(
      expect.anything(),
      { email: "rider@example.com", password: "secret1", name: "Tanvir Ahmed", kind: "rider" },
    );
    expect(inserted("riders")).toMatchObject({
      user_id: "u-new",
      name: "Tanvir Ahmed",
      phone: "01811111111",
      contact_email: "rider@example.com",
      vehicle: "bike",
      zone_ids: ["z1"],
      status: "pending",
      is_online: false,
    });
  });

  it("rejects a duplicate phone/email before creating any login", async () => {
    state.respond = (table, ops, payload) => {
      if (table === "riders" && ops.includes("or")) return { data: [{ id: "rider-0" }], error: null };
      return riderHappy(table, ops, payload);
    };
    await expect(applyRider(RIDER, { password: "secret1" })).rejects.toMatchObject({ status: 409 });
    expect(state.createAccount).not.toHaveBeenCalled();
  });

  it("deletes the fresh login when the rider row cannot be written", async () => {
    state.respond = (table, ops, payload) => {
      if (table === "riders" && ops.includes("insert")) return { data: null, error: { message: "boom" } };
      return riderHappy(table, ops, payload);
    };
    await expect(applyRider(RIDER, { password: "secret1" })).rejects.toThrow("rider application failed");
    expect(state.deleteAccount).toHaveBeenCalledWith(expect.anything(), "u-new");
  });

  it("refuses a reused login that is already a rider", async () => {
    state.createAccount.mockResolvedValue({ userId: "u-old", created: false });
    state.respond = (table, ops, payload) => {
      if (table === "riders" && ops.includes("eq") && !ops.includes("or")) {
        return { data: [{ id: "rider-9" }], error: null };
      }
      return riderHappy(table, ops, payload);
    };
    await expect(applyRider(RIDER, { password: "secret1" })).rejects.toMatchObject({ status: 409 });
    expect(inserted("riders")).toBeUndefined();
    expect(state.deleteAccount).not.toHaveBeenCalled();
  });

  it("still validates the rider fields first", async () => {
    state.respond = riderHappy;
    await expect(applyRider({ ...RIDER, vehicle: "car" }, { password: "secret1" })).rejects.toBeInstanceOf(
      RiderInputError,
    );
    expect(state.createAccount).not.toHaveBeenCalled();
  });

  it("re-applies over this login's REJECTED rider row and keeps the KYC photos (round 4)", async () => {
    state.createAccount.mockResolvedValue({ userId: "u-old", created: false });
    state.respond = (table, ops, payload) => {
      if (table === "riders" && ops.includes("eq") && ops.includes("select") && !ops.includes("or")) {
        return { data: [{ id: "rider-7", status: "rejected" }], error: null };
      }
      if (table === "riders" && ops.includes("update")) return { data: null, error: null };
      return riderHappy(table, ops, payload);
    };
    const result = await applyRider({ ...RIDER, vehicle: "scooter" }, { password: "secret1" });
    expect(result).toEqual({
      id: "rider-7",
      userId: "u-old",
      accountCreated: false,
      loginEmail: "rider@example.com",
      resubmitted: true,
    });
    const update = state.calls.find((c) => c.table === "riders" && c.op === "update");
    expect(update?.args[0]).toMatchObject({
      vehicle: "scooter",
      status: "pending",
      is_online: false,
      review_note: null,
      reviewed_at: null,
    });
    expect(update?.args[0]).not.toHaveProperty("kyc");
    expect(inserted("riders")).toBeUndefined();
  });

  it("gives a phone-only rider application a synthetic login e-mail (round 4)", async () => {
    state.respond = riderHappy;
    const { contactEmail: _omit, ...noEmail } = RIDER;
    void _omit;
    const result = await applyRider(noEmail, { password: "secret1" });
    expect(state.createAccount).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ email: "01811111111@phone.prosanti.app", kind: "rider" }),
    );
    expect(result.loginEmail).toBe("01811111111@phone.prosanti.app");
    const dupe = state.calls.find((c) => c.table === "riders" && c.op === "or");
    expect(dupe?.args[0]).toBe("phone.eq.01811111111,contact_email.eq.01811111111@phone.prosanti.app");
  });
});
