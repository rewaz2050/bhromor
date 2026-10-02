import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { deleteAnnouncement, getRiderInbox, listAnnouncementsForStaff, markRiderInboxRead, postAnnouncement } from "../rider-inbox";

type Result = { data: unknown; error: unknown };

const client = (tables: Record<string, Result>, log: string[] = [], rpcResult: Result = { data: "new-id", error: null }) => ({
  from: (table: string) => {
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "or", "order", "limit", "eq", "in", "maybeSingle", "upsert"]) {
      chain[m] = (...args: unknown[]) => {
        log.push(`${table}.${m}(${args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(",")})`);
        return chain;
      };
    }
    chain.then = (ok: (v: unknown) => unknown) => Promise.resolve(tables[table] ?? { data: [], error: null }).then(ok);
    return chain;
  },
  rpc: (name: string, args: unknown) => {
    log.push(`rpc.${name}(${JSON.stringify(args)})`);
    return Promise.resolve(rpcResult);
  },
});

const recent = () => new Date(Date.now() - 3_600_000).toISOString();

describe("getRiderInbox", () => {
  it("reads broadcast + this rider's messages and counts unread against the marker", async () => {
    const log: string[] = [];
    const out = await getRiderInbox(
      client({
        rider_announcements: { data: [
          { id: "a", title: "A", body: "", severity: "info", rider_id: null, created_at: recent(), expires_at: null },
          { id: "b", title: "B", body: "", severity: "important", rider_id: "r1", created_at: "2020-01-01T00:00:00Z", expires_at: null },
        ], error: null },
        rider_inbox_state: { data: { last_read_at: "2025-01-01T00:00:00Z" }, error: null },
      }, log) as never,
      "r1",
    );
    expect(log).toContain("rider_announcements.or(rider_id.is.null,rider_id.eq.r1)");
    expect(log).toContain("rider_inbox_state.eq(rider_id,r1)");
    expect(out.ready).toBe(true);
    expect(out.items).toHaveLength(2);
    expect(out.unread).toBe(1);
  });

  it("answers ready:false (not an error) when the table is not migrated", async () => {
    const out = await getRiderInbox(client({ rider_announcements: { data: null, error: { message: 'relation "rider_announcements" does not exist', code: "42P01" } } }) as never, "r1");
    expect(out).toEqual({ ready: false, items: [], unread: 0 });
  });

  it("throws on a real database error", async () => {
    await expect(getRiderInbox(client({ rider_announcements: { data: null, error: { message: "boom", code: "XX000" } } }) as never, "r1")).rejects.toThrow();
  });
});

describe("markRiderInboxRead", () => {
  it("upserts the marker for this rider only", async () => {
    const log: string[] = [];
    await markRiderInboxRead(client({ rider_inbox_state: { data: null, error: null } }, log) as never, "r1");
    const call = log.find((l) => l.startsWith("rider_inbox_state.upsert"));
    expect(call).toContain('"rider_id":"r1"');
    expect(call).toContain("onConflict");
  });
});

describe("staff side", () => {
  it("posts through the RPC with every field", async () => {
    const log: string[] = [];
    const id = await postAnnouncement(client({}, log) as never, { title: "T", body: "B", severity: "important", riderId: "r2", expiresHours: 24 });
    expect(id).toBe("new-id");
    expect(log[0]).toBe('rpc.ps_admin_post_announcement({"p_title":"T","p_body":"B","p_severity":"important","p_rider_id":"r2","p_expires_hours":24})');
  });

  it("maps database refusals to stable errors", async () => {
    const input = { title: "T", body: "", severity: "info" as const, riderId: null, expiresHours: null };
    await expect(postAnnouncement(client({}, [], { data: null, error: { message: "rider_not_found" } }) as never, input)).rejects.toThrow("rider_not_found");
    await expect(postAnnouncement(client({}, [], { data: null, error: { message: "forbidden" } }) as never, input)).rejects.toThrow("forbidden");
  });

  it("deletes through the RPC", async () => {
    const log: string[] = [];
    await deleteAnnouncement(client({}, log) as never, "x");
    expect(log[0]).toBe('rpc.ps_admin_delete_announcement({"p_id":"x"})');
  });

  it("lists with rider names, null when not migrated", async () => {
    const out = await listAnnouncementsForStaff(client({
      rider_announcements: { data: [{ id: "a", title: "A", body: null, severity: "important", rider_id: "r1", created_at: "2026-10-01T00:00:00Z", expires_at: null }], error: null },
      riders: { data: [{ id: "r1", name: "Rafiq" }], error: null },
    }) as never);
    expect(out?.[0]).toMatchObject({ riderName: "Rafiq", severity: "important", body: "" });
    expect(await listAnnouncementsForStaff(client({ rider_announcements: { data: null, error: { message: "does not exist", code: "42P01" } } }) as never)).toBeNull();
  });
});
