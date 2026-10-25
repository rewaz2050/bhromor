import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiDownload, apiGet, apiSend } from "../admin-api";

vi.mock("../supabase-browser", () => ({ getSupabaseBrowser: () => null }));
const fetchMock = vi.fn();
beforeEach(() => { localStorage.clear(); fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => vi.unstubAllGlobals());
const callers = [
  { name: "GET", run: () => apiGet("/api/admin/example") },
  { name: "POST", run: () => apiSend("/api/admin/example", "POST", {}) },
  { name: "download", run: () => apiDownload("/api/admin/example") },
];
for (const caller of callers) {
  it.each([true, false, "true", undefined])(`${caller.name} preserves only strict missing metadata: %j`, async missing => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Report unavailable", missing }), { status: 503 }));
    await expect(caller.run()).rejects.toMatchObject({ status: 503, message: "Report unavailable", missing: missing === true });
  });
}
for (const caller of callers) {
  it(`${caller.name} keeps a safe error fallback when a proxy returns non-JSON`, async () => {
    fetchMock.mockResolvedValueOnce(new Response("Proxy unavailable", { status: 502 }));
    await expect(caller.run()).rejects.toMatchObject({ status: 502, missing: false, message: "Something went wrong — please try again." });
  });
}
