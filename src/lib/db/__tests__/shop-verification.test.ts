/**
 * B5 (2026-09-28) — the staff write behind the badge.
 *
 * The database already refuses a badge without both documents; what is tested
 * here is that this layer never PRETENDS: it records the officer of the
 * verified session (never the request body), it stamps only when both boxes are
 * ticked, it says "not installed" when the migration is missing instead of
 * showing an empty shop, and a failure to write the history log never costs the
 * shop its badge.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  updates: [] as Record<string, unknown>[],
  inserts: [] as Record<string, unknown>[],
  selects: [] as string[],
  readAnswer: null as unknown,
  readError: null as { code?: string; message?: string } | null,
  updateAnswer: null as unknown,
  updateError: null as { code?: string; message?: string } | null,
  logError: null as { code?: string; message?: string } | null,
  events: [] as Record<string, unknown>[],
}));

const chain = (data: unknown, error: unknown = null) => {
  const obj: Record<string, unknown> = { data, error };
  obj.select = (cols?: string) => {
    if (cols) state.selects.push(cols);
    return obj;
  };
  obj.eq = () => obj;
  obj.order = () => obj;
  obj.limit = () => obj;
  obj.maybeSingle = () => obj;
  return obj;
};

const fakeDb = (): SupabaseClient =>
  ({
    from: (table: string) => {
      if (table === "shop_verification_events") {
        return {
          select: () => chain(state.events, null),
          insert: async (row: Record<string, unknown>) => {
            if (state.logError) return { data: null, error: state.logError };
            state.inserts.push(row);
            return { data: null, error: null };
          },
        };
      }
      return {
        select: () => chain(state.readAnswer, state.readError),
        update: (vals: Record<string, unknown>) => {
          state.updates.push(vals);
          const obj: Record<string, unknown> = {};
          obj.eq = () => obj;
          obj.select = () => obj;
          obj.maybeSingle = async () => ({
            data: state.updateError ? null : (state.updateAnswer ?? { id: "s1" }),
            error: state.updateError,
          });
          return obj;
        },
      };
    },
  }) as unknown as SupabaseClient;

const { setShopVerification, shopVerificationHistory } = await import("../shop-verification");

const ACTOR = { id: "u1", email: "Staff@Prosanti.Example" };

beforeEach(() => {
  state.updates = [];
  state.inserts = [];
  state.selects = [];
  state.readError = null;
  state.readAnswer = { nid_checked: false, trade_licence_checked: false, verified_at: null };
  state.updateAnswer = {
    id: "s1",
    slug: "sitara",
    name: "Sitara",
    tagline: "",
    logo_url: "",
    phone: "01711111111",
    contact_email: "",
    address: "",
    zone_ids: [],
    prep_minutes: 15,
    commission_pct: 15,
    status: "active",
    is_open: true,
    rating_avg: 0,
    rating_count: 0,
    nid_checked: true,
    trade_licence_checked: true,
    verified_at: "2026-09-28T12:00:00.000Z",
    verified_by: "u1",
    verified_by_email: "staff@prosanti.example",
  };
  state.updateError = null;
  state.logError = null;
  state.events = [];
});

describe("setShopVerification", () => {
  it("stamps the badge only when BOTH documents are ticked", async () => {
    await setShopVerification(fakeDb(), "s1", { nid: true, tradeLicence: true }, ACTOR);
    const patch = state.updates[0];
    expect(patch.nid_checked).toBe(true);
    expect(patch.trade_licence_checked).toBe(true);
    expect(patch.verified_by).toBe("u1");
    expect(patch.verified_by_email).toBe("staff@prosanti.example");
    expect(typeof patch.verified_at).toBe("string");
  });

  it("clears the badge, the stamp and the officer when a check is lifted", async () => {
    state.readAnswer = { nid_checked: true, trade_licence_checked: true, verified_at: "2026-09-01T00:00:00.000Z" };
    await setShopVerification(fakeDb(), "s1", { nid: true, tradeLicence: false }, ACTOR);
    expect(state.updates[0]).toMatchObject({
      nid_checked: true,
      trade_licence_checked: false,
      verified_at: null,
      verified_by: null,
      verified_by_email: null,
    });
  });

  it("records who decided — from the session, never from the body", async () => {
    await setShopVerification(
      fakeDb(),
      "s1",
      { nid: true, tradeLicence: true, verified_by_email: "attacker@example.com" },
      ACTOR,
    );
    const event = state.inserts[0];
    expect(event.actor_id).toBe("u1");
    expect(event.actor_email).toBe("staff@prosanti.example");
    expect(event.action).toBe("verified");
  });

  it("logs 'unverified' when the badge comes off, and 'note' when nothing changed", async () => {
    state.readAnswer = { nid_checked: true, trade_licence_checked: true, verified_at: "2026-09-01T00:00:00.000Z" };
    await setShopVerification(fakeDb(), "s1", { nid: false, tradeLicence: true }, ACTOR);
    expect(state.inserts[0].action).toBe("unverified");

    // Half a badge is not a badge: ticking one box on an unverified shop is a
    // note, not a verification.
    state.inserts = [];
    state.readAnswer = { nid_checked: false, trade_licence_checked: false, verified_at: null };
    await setShopVerification(fakeDb(), "s1", { nid: true, tradeLicence: false, note: "NID seen" }, ACTOR);
    expect(state.inserts[0].action).toBe("note");

    // …and the real thing, from an unverified shop, is a verification.
    state.inserts = [];
    await setShopVerification(fakeDb(), "s1", { nid: true, tradeLicence: true }, ACTOR);
    expect(state.inserts[0].action).toBe("verified");
  });

  it("keeps a note that came with a half-checked shop", async () => {
    await setShopVerification(fakeDb(), "s1", { nid: true, tradeLicence: false, note: "NID seen, licence pending" }, ACTOR);
    expect(state.updates[0].verification_note).toBe("NID seen, licence pending");
    expect(state.updates[0].verified_at).toBeNull();
  });

  it("refuses an empty submission instead of quietly wiping a badge", async () => {
    await expect(
      setShopVerification(fakeDb(), "s1", { nid: false, tradeLicence: false }, ACTOR),
    ).rejects.toMatchObject({ status: 422 });
    expect(state.updates).toEqual([]);
  });

  it("names the missing migration (503) rather than showing an empty shop", async () => {
    state.readError = { code: "42703", message: 'column "nid_checked" does not exist' };
    await expect(
      setShopVerification(fakeDb(), "s1", { nid: true, tradeLicence: true }, ACTOR),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("404s a shop that is not there", async () => {
    state.readAnswer = null;
    await expect(
      setShopVerification(fakeDb(), "gone", { nid: true, tradeLicence: true }, ACTOR),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("passes the database's own refusal through unchanged", async () => {
    state.updateError = { code: "P0001", message: "only staff can verify a shop" };
    await expect(
      setShopVerification(fakeDb(), "s1", { nid: true, tradeLicence: true }, ACTOR),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("keeps the badge even when the history log will not write", async () => {
    state.logError = { code: "42501", message: "permission denied" };
    const shop = await setShopVerification(fakeDb(), "s1", { nid: true, tradeLicence: true }, ACTOR);
    // The badge stands on the shop row, not on the log.
    expect(shop.verification?.nid).toBe(true);
    expect(shop.verification?.tradeLicence).toBe(true);
  });
});

describe("shopVerificationHistory", () => {
  it("returns the officer, the note and the newest events first", async () => {
    state.readAnswer = {
      verification_note: "NID + licence seen",
      verified_by: "u1",
      verified_by_email: "staff@prosanti.example",
      verified_at: "2026-09-28T12:00:00.000Z",
    };
    state.events = [
      { id: 2, shop_id: "s1", created_at: "2026-09-28T12:00:00.000Z", action: "unverified", nid_checked: true, trade_licence_checked: false, note: "licence expired", actor_email: "b@x" },
      { id: 1, shop_id: "s1", created_at: "2026-09-01T12:00:00.000Z", action: "verified", nid_checked: true, trade_licence_checked: true, note: null, actor_email: "a@x" },
    ];
    const history = await shopVerificationHistory(fakeDb(), "s1");
    expect(history.audit).toMatchObject({
      note: "NID + licence seen",
      byEmail: "staff@prosanti.example",
    });
    expect(history.audit.at).toBe(Date.parse("2026-09-28T12:00:00.000Z"));
    expect(history.events.map((e) => e.action)).toEqual(["unverified", "verified"]);
    expect(history.events[1].note).toBeNull();
  });

  it("says 'never verified' honestly", async () => {
    state.readAnswer = { verification_note: null, verified_by: null, verified_by_email: null, verified_at: null };
    const history = await shopVerificationHistory(fakeDb(), "s1");
    expect(history.audit.at).toBeNull();
    expect(history.audit.byEmail).toBeNull();
    expect(history.events).toEqual([]);
  });
});
