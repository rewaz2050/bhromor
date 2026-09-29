import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { requestWithBodyLimit } from "@/lib/request-body-limit";

describe("requestWithBodyLimit", () => {
  it("preserves a bounded request body for the downstream route", async () => {
    const original = new Request("https://example.test/api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    });
    const bounded = await requestWithBodyLimit(original, 100);
    expect(await bounded.json()).toEqual({ ok: true });
  });

  it("rejects a declared oversize body without parsing it", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "Content-Length": "500" },
      body: "tiny",
    });
    await expect(requestWithBodyLimit(request, 10)).rejects.toMatchObject({ status: 413 });
  });

  it("counts actual streamed bytes when content-length is missing", async () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      body: "12345678901",
    });
    await expect(requestWithBodyLimit(request, 10)).rejects.toMatchObject({ status: 413 });
  });
});
