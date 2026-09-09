import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GET as ridersGet, POST as ridersPost } from "../admin/riders/route";
import { POST as linkRider } from "../admin/riders/[id]/link-rider/route";

const get = (path: string): Request => new Request(`http://localhost${path}`);
const post = (path: string, body: unknown): Request =>
  new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("rider routes without a staff session (slice 6)", () => {
  it("401s queue reads and writes", async () => {
    expect((await ridersGet(get("/api/admin/riders"))).status).toBe(401);
    expect(
      (await ridersPost(post("/api/admin/riders", {}))).status,
    ).toBe(401);
  });

  it("401s rider login linking without a staff session", async () => {
    const res = await linkRider(
      post("/api/admin/riders/rider-1/link-rider", { email: "r@x.com" }),
      { params: Promise.resolve({ id: "rider-1" }) },
    );
    expect(res.status).toBe(401);
  });
});
