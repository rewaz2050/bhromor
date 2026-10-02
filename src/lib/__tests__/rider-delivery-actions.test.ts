import { afterEach, describe, expect, it, vi } from "vitest";
import { failedAttemptMessage, releaseAcceptedJob, reportFailedAttempt, uploadDeliveryProof } from "../rider-delivery-actions";

const res = (body: unknown, ok = true, status = ok ? 200 : 400) => ({ ok, status, json: async () => body });
const file = new File(["x"], "p.jpg", { type: "image/jpeg" });
const SIGN = { cloudName: "c", apiKey: "k", timestamp: 1, folder: "f", signature: "s", uploadUrl: "https://up.example/x" };

afterEach(() => vi.unstubAllGlobals());

describe("uploadDeliveryProof", () => {
  it("signs with the RIDER endpoint, then uploads the signed form", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res(SIGN)).mockResolvedValueOnce(res({ secure_url: "https://img/1.jpg" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await uploadDeliveryProof(file)).toEqual({ ok: true, url: "https://img/1.jpg" });
    expect(fetchMock.mock.calls[0]).toEqual(["/api/rider/media/sign", { method: "POST" }]);
    const [url, init] = fetchMock.mock.calls[1] as [string, { body: FormData }];
    expect(url).toBe("https://up.example/x");
    expect(init.body.get("signature")).toBe("s");
    expect(init.body.get("api_key")).toBe("k");
    expect(init.body.get("folder")).toBe("f");
  });
  it("503 from the signer says photos are not configured and delivery is still possible", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res({}, false, 503)));
    const r = await uploadDeliveryProof(file);
    expect(r).toMatchObject({ ok: false });
    expect(r.ok ? "" : r.message).toMatch(/not configured/);
  });
  it("another signer failure asks the rider to retry or give a reason; a server message wins", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res({}, false, 500)));
    const r = await uploadDeliveryProof(file);
    expect(r.ok ? "" : r.message).toMatch(/আবার চেষ্টা করুন/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res({ error: "Not allowed" }, false, 403)));
    expect(await uploadDeliveryProof(file)).toEqual({ ok: false, message: "Not allowed" });
  });
  it("a failed Cloudinary upload reports its message, or a generic one", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(res(SIGN)).mockResolvedValueOnce(res({ error: { message: "File too large" } }, false)));
    expect(await uploadDeliveryProof(file)).toEqual({ ok: false, message: "File too large" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(res(SIGN)).mockResolvedValueOnce(res({}, true)));
    expect(await uploadDeliveryProof(file)).toEqual({ ok: false, message: "Upload failed" });
  });
  it("never throws on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await uploadDeliveryProof(file)).toEqual({ ok: false, message: "offline" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue("weird"));
    expect(await uploadDeliveryProof(file)).toEqual({ ok: false, message: "Photo upload failed" });
  });
});

describe("failed attempts", () => {
  it("message tells whether it was the last attempt", () => {
    expect(failedAttemptMessage({ final: true })).toMatch(/শেষ চেষ্টা ব্যর্থ/);
    expect(failedAttemptMessage({ attempts: 1, maxAttempts: 2 })).toContain("(1/2)");
    expect(failedAttemptMessage(null)).toContain("(?/?)");
  });
  it("posts the reason to the assignment's failed endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ final: false, attempts: 1, maxAttempts: 2 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await reportFailedAttempt("asg-1", "phone off");
    expect(r).toMatchObject({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("/api/rider/assignments/asg-1/failed");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ reason: "phone off" });
  });
  it("returns the server's refusal, a generic one, and never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res({ error: "Reason too short" }, false)));
    expect(await reportFailedAttempt("a", "xx")).toEqual({ ok: false, message: "Reason too short" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => { throw new Error("bad json"); } }));
    expect(await reportFailedAttempt("a", "xx")).toEqual({ ok: false, message: "Failed — try again." });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await reportFailedAttempt("a", "xx")).toEqual({ ok: false, message: "Failed — try again." });
  });
});

describe("releaseAcceptedJob", () => {
  it("posts the reason to the assignment's release endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ released: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await releaseAcceptedJob("asg-1", "bike broke")).toMatchObject({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("/api/rider/assignments/asg-1/release");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ reason: "bike broke" });
  });
  it("returns the server's refusal or a generic one, and never throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(res({ error: "Too late" }, false, 409)));
    expect(await releaseAcceptedJob("a", "xxxxx")).toEqual({ ok: false, message: "Too late" });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await releaseAcceptedJob("a", "xxxxx")).toMatchObject({ ok: false });
  });
});
