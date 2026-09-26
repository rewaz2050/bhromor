/**
 * Password reset requests (2026-09-26; no SMS, no e-mail): request → staff
 * approve → self-set within 24 h. Exercised against a small chainable mock
 * of the Supabase client so the state machine is checked end to end.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({
  updateUserById: vi.fn(async () => ({ error: null as null | { message: string } })),
}));

import {
  RESET_APPROVAL_WINDOW_MS,
  ResetRequestError,
  completeResetRequest,
  createResetRequest,
  decideResetRequest,
  effectiveStatus,
  findResetSubject,
  listResetRequests,
  normalizeResetEmail,
  normalizeResetPhone,
  parseResetKind,
  resetRequestStatus,
  toAdminResetRequest,
  type ResetRequestRow,
} from "../password-reset";

type Row = Record<string, unknown>;

/** In-memory tables + a PostgREST-ish query builder (only what the module uses). */
const makeService = (tables: Record<string, Row[]>) => {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const from = (table: string) => {
    const rows = () => tables[table] ?? (tables[table] = []);
    const filters: ((r: Row) => boolean)[] = [];
    let ordering: { col: string; asc: boolean } | null = null;
    let limitN = Infinity;
    let pendingInsert: Row | null = null;
    let pendingUpdate: Row | null = null;
    let head = false;
    const apply = () => {
      let out = rows().filter((r) => filters.every((f) => f(r)));
      if (ordering) {
        const { col, asc } = ordering;
        out = [...out].sort((a, b) =>
          String(a[col]) < String(b[col]) ? (asc ? -1 : 1) : String(a[col]) > String(b[col]) ? (asc ? 1 : -1) : 0,
        );
      }
      return out.slice(0, limitN);
    };
    const run = () => {
      if (pendingInsert) {
        const row = pendingInsert;
        // partial unique index: one open request per user
        if (
          table === "password_reset_requests" &&
          rows().some((r) => r.user_id === row.user_id && ["pending", "approved"].includes(String(r.status)))
        ) {
          return { data: null, error: { message: "duplicate key value violates unique constraint" }, count: null };
        }
        rows().push(row);
        return { data: row, error: null, count: null };
      }
      if (pendingUpdate) {
        const patch = pendingUpdate;
        const hit = apply();
        for (const r of hit) Object.assign(r, patch);
        return { data: hit, error: null, count: null };
      }
      const data = apply();
      return { data: head ? null : data, error: null, count: data.length };
    };
    const builder: Record<string, unknown> = {};
    const chain = (op: string, fn: (...a: unknown[]) => void) => {
      builder[op] = (...args: unknown[]) => {
        calls.push({ table, op, args });
        fn(...args);
        return builder;
      };
    };
    chain("select", (_cols, opts) => {
      head = Boolean((opts as { head?: boolean } | undefined)?.head);
    });
    chain("eq", (col, val) => filters.push((r) => r[col as string] === val));
    chain("neq", (col, val) => filters.push((r) => r[col as string] !== val));
    chain("in", (col, vals) => filters.push((r) => (vals as unknown[]).includes(r[col as string])));
    chain("ilike", (col, pattern) => {
      const needle = String(pattern).replace(/\\([\\%_])/g, "$1").toLowerCase();
      filters.push((r) => String(r[col as string] ?? "").toLowerCase() === needle);
    });
    chain("order", (col, opts) => {
      ordering = { col: col as string, asc: (opts as { ascending?: boolean } | undefined)?.ascending !== false };
    });
    chain("limit", (n) => {
      limitN = n as number;
    });
    chain("insert", (row) => {
      pendingInsert = { id: `req-${rows().length + 1}`, status: "pending", requested_at: new Date(NOW).toISOString(), note: null, reviewed_at: null, reviewed_by: null, expires_at: null, used_at: null, ...(row as Row) };
    });
    chain("update", (patch) => {
      pendingUpdate = patch as Row;
    });
    builder.single = async () => {
      const res = run();
      return { data: Array.isArray(res.data) ? res.data[0] ?? null : res.data, error: res.error };
    };
    builder.maybeSingle = builder.single;
    builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(run()).then(resolve, reject);
    return builder;
  };
  return { client: { from, auth: { admin: auth } } as never, calls, tables };
};

const NOW = Date.parse("2026-09-26T10:00:00Z");

const baseTables = (): Record<string, Row[]> => ({
  shops: [{ id: "shop-1", name: "Arian Fashion", phone: "+8801712345678", contact_email: "Shop@Example.com" }],
  vendor_users: [{ shop_id: "shop-1", user_id: "vendor-user-1", role: "owner" }],
  riders: [
    { id: "rider-1", name: "Tanvir", phone: "01811111111", contact_email: "rider@example.com", user_id: "rider-user-1" },
    { id: "rider-2", name: "No Login", phone: "01822222222", contact_email: "nologin@example.com", user_id: null },
  ],
  password_reset_requests: [],
});

beforeEach(() => {
  auth.updateUserById.mockClear();
  auth.updateUserById.mockResolvedValue({ error: null });
});

describe("input normalisation", () => {
  it("lower-cases and validates the email", () => {
    expect(normalizeResetEmail("  Shop@Example.com ")).toBe("shop@example.com");
    expect(() => normalizeResetEmail("nope")).toThrow(ResetRequestError);
  });
  it("normalises BD phones to 01XXXXXXXXX and rejects others", () => {
    expect(normalizeResetPhone("+880 17-1234 5678")).toBe("01712345678");
    expect(() => normalizeResetPhone("12345")).toThrow(ResetRequestError);
  });
  it("accepts only the two login kinds", () => {
    expect(parseResetKind("vendor")).toBe("vendor");
    expect(() => parseResetKind("admin")).toThrow(ResetRequestError);
  });
});

describe("effectiveStatus", () => {
  it("turns a lapsed approval into expired without touching other states", () => {
    const row = { status: "approved" as const, expires_at: new Date(NOW - 1).toISOString() };
    expect(effectiveStatus(row, NOW)).toBe("expired");
    expect(effectiveStatus({ status: "approved", expires_at: new Date(NOW + 1000).toISOString() }, NOW)).toBe("approved");
    expect(effectiveStatus({ status: "pending", expires_at: null }, NOW)).toBe("pending");
    expect(effectiveStatus({ status: "used", expires_at: new Date(NOW - 1).toISOString() }, NOW)).toBe("used");
  });
});

describe("findResetSubject", () => {
  it("matches a shop by contact email (case-insensitive) + phone and resolves the owner login", async () => {
    const { client } = makeService(baseTables());
    await expect(findResetSubject(client, "vendor", "shop@example.com", "01712345678")).resolves.toEqual({
      userId: "vendor-user-1",
      subjectId: "shop-1",
      name: "Arian Fashion",
    });
  });
  it("refuses a phone that does not match, and a rider row without a login", async () => {
    const { client } = makeService(baseTables());
    await expect(findResetSubject(client, "vendor", "shop@example.com", "01799999999")).resolves.toBeNull();
    await expect(findResetSubject(client, "rider", "nologin@example.com", "01822222222")).resolves.toBeNull();
    await expect(findResetSubject(client, "rider", "rider@example.com", "01811111111")).resolves.toMatchObject({
      userId: "rider-user-1",
    });
  });
});

describe("request → approve → complete", () => {
  it("files a pending request once and answers the same one on a repeat", async () => {
    const { client, tables } = makeService(baseTables());
    const first = await createResetRequest(client, { kind: "vendor", email: "shop@example.com", phone: "01712345678", ip: "1.2.3.4" }, NOW);
    expect(first.created).toBe(true);
    expect(first.request.status).toBe("pending");
    expect(first.subject.name).toBe("Arian Fashion");
    const again = await createResetRequest(client, { kind: "vendor", email: "shop@example.com", phone: "01712345678" }, NOW);
    expect(again.created).toBe(false);
    expect(tables.password_reset_requests).toHaveLength(1);
    expect(tables.password_reset_requests[0]).toMatchObject({ user_id: "vendor-user-1", requested_ip: "1.2.3.4", phone: "01712345678" });
  });

  it("404s an email + phone pair that is not on file", async () => {
    const { client } = makeService(baseTables());
    await expect(
      createResetRequest(client, { kind: "vendor", email: "who@example.com", phone: "01712345678" }, NOW),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("refuses to complete before approval, then sets the password once approved and closes the request", async () => {
    const { client, tables } = makeService(baseTables());
    await createResetRequest(client, { kind: "rider", email: "rider@example.com", phone: "01811111111" }, NOW);
    await expect(
      completeResetRequest(client, { kind: "rider", email: "rider@example.com", phone: "01811111111", password: "newpass1" }, NOW),
    ).rejects.toMatchObject({ status: 409 });
    expect(auth.updateUserById).not.toHaveBeenCalled();

    const id = String(tables.password_reset_requests[0].id);
    const decided = await decideResetRequest(client, { id, action: "approve", staffId: "staff-1" }, NOW);
    expect(decided.status).toBe("approved");
    expect(Date.parse(decided.expiresAt ?? "")).toBe(NOW + RESET_APPROVAL_WINDOW_MS);

    const status = await resetRequestStatus(client, { kind: "rider", email: "rider@example.com", phone: "01811111111" }, NOW + 1000);
    expect(status.status).toBe("approved");
    expect(status.expiresAt).toBe(decided.expiresAt);

    await completeResetRequest(client, { kind: "rider", email: "rider@example.com", phone: "01811111111", password: "newpass1" }, NOW + 2000);
    expect(auth.updateUserById).toHaveBeenCalledWith("rider-user-1", { password: "newpass1" });
    expect(tables.password_reset_requests[0]).toMatchObject({ status: "used" });

    // A second attempt finds nothing approved.
    await expect(
      completeResetRequest(client, { kind: "rider", email: "rider@example.com", phone: "01811111111", password: "another1" }, NOW + 3000),
    ).rejects.toMatchObject({ status: 409 });
    expect(auth.updateUserById).toHaveBeenCalledTimes(1);
  });

  it("never sets a short password even inside an approved window", async () => {
    const { client, tables } = makeService(baseTables());
    await createResetRequest(client, { kind: "rider", email: "rider@example.com", phone: "01811111111" }, NOW);
    await decideResetRequest(client, { id: String(tables.password_reset_requests[0].id), action: "approve", staffId: "s" }, NOW);
    await expect(
      completeResetRequest(client, { kind: "rider", email: "rider@example.com", phone: "01811111111", password: "abc" }, NOW),
    ).rejects.toThrow();
    expect(auth.updateUserById).not.toHaveBeenCalled();
    expect(tables.password_reset_requests[0]).toMatchObject({ status: "approved" });
  });

  it("expires a lapsed approval (410) and lets a fresh request be filed", async () => {
    const { client, tables } = makeService(baseTables());
    await createResetRequest(client, { kind: "vendor", email: "shop@example.com", phone: "01712345678" }, NOW);
    await decideResetRequest(client, { id: String(tables.password_reset_requests[0].id), action: "approve", staffId: "s" }, NOW);
    const later = NOW + RESET_APPROVAL_WINDOW_MS + 1;
    const status = await resetRequestStatus(client, { kind: "vendor", email: "shop@example.com", phone: "01712345678" }, later);
    expect(status.status).toBe("expired");
    await expect(
      completeResetRequest(client, { kind: "vendor", email: "shop@example.com", phone: "01712345678", password: "newpass1" }, later),
    ).rejects.toMatchObject({ status: 410 });
    expect(tables.password_reset_requests[0]).toMatchObject({ status: "expired" });
    const fresh = await createResetRequest(client, { kind: "vendor", email: "shop@example.com", phone: "01712345678" }, later);
    expect(fresh.created).toBe(true);
    expect(tables.password_reset_requests).toHaveLength(2);
  });

  it("rejects with a note the requester can read, and refuses to decide twice", async () => {
    const { client, tables } = makeService(baseTables());
    await createResetRequest(client, { kind: "vendor", email: "shop@example.com", phone: "01712345678" }, NOW);
    const id = String(tables.password_reset_requests[0].id);
    const rejected = await decideResetRequest(client, { id, action: "reject", note: "  ফোনে মেলেনি  ", staffId: "s" }, NOW);
    expect(rejected).toMatchObject({ status: "rejected", note: "ফোনে মেলেনি" });
    const status = await resetRequestStatus(client, { kind: "vendor", email: "shop@example.com", phone: "01712345678" }, NOW);
    expect(status).toMatchObject({ status: "rejected", note: "ফোনে মেলেনি", expiresAt: null });
    await expect(decideResetRequest(client, { id, action: "approve", staffId: "s" }, NOW)).rejects.toMatchObject({ status: 409 });
  });
});

describe("staff list", () => {
  it("splits pending (oldest first) from recent decisions and derives expiry", async () => {
    const tables = baseTables();
    const row = (over: Partial<ResetRequestRow>): Row => ({
      id: "x", kind: "vendor", user_id: "u", subject_id: "s", subject_name: "S", email: "e@x.co", phone: "01712345678",
      status: "pending", note: null, requested_at: new Date(NOW).toISOString(), requested_ip: null, reviewed_at: null,
      reviewed_by: null, expires_at: null, used_at: null, ...over,
    });
    tables.password_reset_requests = [
      row({ id: "p2", requested_at: new Date(NOW - 1000).toISOString() }),
      row({ id: "p1", requested_at: new Date(NOW - 5000).toISOString() }),
      row({ id: "a1", status: "approved", expires_at: new Date(NOW - 1).toISOString(), requested_at: new Date(NOW - 9000).toISOString() }),
      row({ id: "u1", status: "used", requested_at: new Date(NOW - 2000).toISOString() }),
    ];
    const { client } = makeService(tables);
    const { pending, recent } = await listResetRequests(client, NOW);
    expect(pending.map((r) => r.id)).toEqual(["p1", "p2"]);
    expect(recent.map((r) => [r.id, r.status])).toEqual([["u1", "used"], ["a1", "expired"]]);
    expect(toAdminResetRequest(tables.password_reset_requests[2] as unknown as ResetRequestRow, NOW).status).toBe("expired");
  });
});
