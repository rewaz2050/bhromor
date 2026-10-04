import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { listFailedProofs, readFailedProofMode, recordFailedProof, writeFailedProofMode } from "../failed-proof";

const settingsDb = (o: { value?: unknown; error?: boolean; throws?: boolean; writeError?: boolean }) => {
  const upserts: unknown[] = [];
  const db = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (o.throws) throw new Error("boom");
            return { data: o.value === undefined ? null : { value: o.value }, error: o.error ? { message: "x" } : null };
          },
        }),
      }),
      upsert: async (row: unknown) => {
        upserts.push(row);
        return { error: o.writeError ? { message: "denied" } : null };
      },
    }),
  } as never;
  return { db, upserts };
};

describe("failed-proof setting", () => {
  it("reads 0/1/2 and falls back to off on a missing key, an error or a throw", async () => {
    expect(await readFailedProofMode(settingsDb({ value: 2 }).db)).toBe(2);
    expect(await readFailedProofMode(settingsDb({ value: "1" }).db)).toBe(1);
    expect(await readFailedProofMode(settingsDb({}).db)).toBe(0);
    expect(await readFailedProofMode(settingsDb({ value: 2, error: true }).db)).toBe(0);
    expect(await readFailedProofMode(settingsDb({ throws: true }).db)).toBe(0);
  });
  it("writes through the caller's client; a bad value is a 422 and writes nothing", async () => {
    const { db, upserts } = settingsDb({});
    expect(await writeFailedProofMode(db, 2)).toBe(2);
    expect(upserts).toEqual([{ key: "failed_delivery_proof", value: 2 }]);
    await expect(writeFailedProofMode(db, 5)).rejects.toMatchObject({ status: 422 });
    expect(upserts).toHaveLength(1);
    await expect(writeFailedProofMode(settingsDb({ writeError: true }).db, 1)).rejects.toThrow(/Could not save/);
  });
});

describe("recordFailedProof", () => {
  const makeService = (o: { orderId?: string | null; insertError?: boolean; throws?: boolean } = {}) => {
    const inserts: Record<string, unknown>[] = [];
    const service = {
      from: (table: string) => {
        if (table === "delivery_assignments") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  if (o.throws) throw new Error("boom");
                  return { data: o.orderId === null ? null : { order_id: o.orderId ?? "o1" } };
                },
              }),
            }),
          };
        }
        return {
          insert: async (row: Record<string, unknown>) => {
            inserts.push(row);
            return { error: o.insertError ? { message: "x" } : null };
          },
        };
      },
    } as never;
    return { service, inserts };
  };

  it("stores the photo for the assignment's order", async () => {
    const { service, inserts } = makeService();
    await recordFailedProof(service, { assignmentId: "a1", riderId: "r1", proofUrl: "https://res.cloudinary.com/c/x.jpg", noPhotoNote: "ignored" });
    expect(inserts).toEqual([{ order_id: "o1", assignment_id: "a1", rider_id: "r1", photo_url: "https://res.cloudinary.com/c/x.jpg", no_photo_note: null }]);
  });
  it("stores the note when there is no photo; writes nothing when there is neither", async () => {
    const { service, inserts } = makeService();
    await recordFailedProof(service, { assignmentId: "a1", riderId: "r1", proofUrl: null, noPhotoNote: "camera broken" });
    expect(inserts[0]).toMatchObject({ photo_url: null, no_photo_note: "camera broken" });
    await recordFailedProof(service, { assignmentId: "a1", riderId: "r1", proofUrl: null, noPhotoNote: null });
    expect(inserts).toHaveLength(1);
  });
  it("never throws — the attempt is already on record", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await recordFailedProof(makeService({ throws: true }).service, { assignmentId: "a", riderId: "r", proofUrl: "https://x", noPhotoNote: null });
    await recordFailedProof(makeService({ insertError: true }).service, { assignmentId: "a", riderId: "r", proofUrl: "https://x", noPhotoNote: null });
    await recordFailedProof(makeService({ orderId: null }).service, { assignmentId: "a", riderId: "r", proofUrl: "https://x", noPhotoNote: null });
    spy.mockRestore();
  });
});

describe("listFailedProofs", () => {
  const listDb = (o: { rows?: unknown[]; error?: { code?: string; message?: string } }) =>
    ({
      from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: o.rows ?? [], error: o.error ?? null }) }) }) }) }),
    }) as never;
  it("shapes rows for staff", async () => {
    const r = await listFailedProofs(listDb({ rows: [{ id: "p1", created_at: "2026-10-03T06:00:00Z", photo_url: "https://x/y.jpg", no_photo_note: null }] }), "o1");
    expect(r).toEqual({ ready: true, proofs: [{ id: "p1", at: "2026-10-03T06:00:00Z", photoUrl: "https://x/y.jpg", noPhotoNote: null }] });
  });
  it("says 'not ready' without the migration; a real failure throws", async () => {
    expect(await listFailedProofs(listDb({ error: { code: "42P01" } }), "o1")).toEqual({ ready: false, proofs: [] });
    await expect(listFailedProofs(listDb({ error: { code: "XX000", message: "boom" } }), "o1")).rejects.toThrow(/failed-delivery photos/);
  });
});
