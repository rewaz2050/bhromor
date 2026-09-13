import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DELETE as staffDelete,
  GET as staffGet,
  POST as staffPost,
} from "../admin/staff/route";

const get = (path: string): Request => new Request(`http://localhost${path}`);
const send = (path: string, method: string, body: unknown): Request =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("return action route without a session (P1 #13)", () => {
  it("401s approve/reject/complete", async () => {
    const { POST: postReturn } = await import("../admin/orders/[id]/return/route");
    const path = "/api/admin/orders/PS-20260901-0002/return";
    for (const action of ["approve", "reject", "complete"]) {
      const res = await postReturn(
        new Request(`http://localhost${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }),
      );
      expect(res.status).toBe(401);
    }
  });
});

describe("wallet payment route without a session (P1 #8)", () => {
  it("401s verified/reject", async () => {
    const { POST } = await import("../admin/orders/[id]/payment/route");
    for (const action of ["verified", "rejected"]) {
      const res = await POST(
        new Request("http://localhost/api/admin/orders/PS-20260901-0002/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }),
      );
      expect(res.status).toBe(401);
    }
  });
});

describe("warranty claim routes without a session (P1 #14)", () => {
  it("401s the claim list", async () => {
    const { GET } = await import("../admin/warranty/route");
    expect(
      (await GET(new Request("http://localhost/api/admin/warranty"))).status,
    ).toBe(401);
  });

  it("401s review/approve/reject", async () => {
    const { POST } = await import("../admin/warranty/[id]/route");
    for (const action of ["review", "approve", "reject"]) {
      const res = await POST(
        new Request("http://localhost/api/admin/warranty/claim-1", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }),
      );
      expect(res.status).toBe(401);
    }
  });
});

describe("staff routes without a session (admin control center)", () => {
  it("401s list, grant and revoke", async () => {
    expect((await staffGet(get("/api/admin/staff"))).status).toBe(401);
    expect(
      (
        await staffPost(
          send("/api/admin/staff", "POST", {
            email: "x@y.com",
            role: "manager",
          }),
        )
      ).status,
    ).toBe(401);
    expect(
      (await staffDelete(send("/api/admin/staff", "DELETE", { email: "x@y.com" })))
        .status,
    ).toBe(401);
  });
});
