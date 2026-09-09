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
