/** POST /api/admin/riders/:id/settle — `netWallet` reaches the reader only as a literal `true` (audit K). */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const STAFF_DB = vi.hoisted(() => ({ kind: "staff-jwt" }));
const settle = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/staff-auth", () => ({
  StaffAuthError: class StaffAuthError extends Error {},
  requireStaff: async () => ({ user: { id: "s1", email: "o@x.test" }, db: STAFF_DB, role: "admin" }),
  requireStaffRole: async () => ({ user: { id: "s1", email: "o@x.test" }, db: STAFF_DB, role: "admin" }),
}));
vi.mock("@/lib/db/riders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/riders")>()),
  settleRiderCashByAdmin: settle,
}));

import { POST } from "../admin/riders/[id]/settle/route";

const ID = "11111111-1111-4111-8111-111111111111";
const post = (body: unknown) =>
  (POST as unknown as (r: Request, c: unknown) => Promise<Response>)(
    new Request(`http://localhost/api/admin/riders/${ID}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ID }) },
  );

beforeEach(() => settle.mockClear());

describe("admin settle route — netting", () => {
  it("defaults to a plain settle with the staff client", async () => {
    expect((await post({ method: "cash" })).status).toBe(200);
    expect(settle).toHaveBeenCalledWith(STAFF_DB, ID, "cash", "", false);
  });

  it("nets only for a literal true", async () => {
    await post({ method: "cash", netWallet: true });
    expect(settle).toHaveBeenLastCalledWith(STAFF_DB, ID, "cash", "", true);
    await post({ method: "cash", netWallet: "true" });
    expect(settle).toHaveBeenLastCalledWith(STAFF_DB, ID, "cash", "", false);
  });
});
