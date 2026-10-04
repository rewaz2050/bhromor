import { describe, expect, it } from "vitest";
import { decideFailedProof, parseFailedProofMode, sanitizeFailedProofMode } from "../failed-proof";

const base = { cloudName: "demo", uploadsConfigured: true, proofUrl: undefined as unknown, noPhotoReason: undefined as unknown };
const OURS = "https://res.cloudinary.com/demo/image/upload/v1/prosanti/delivery-proofs/door.jpg";

describe("failed-proof mode", () => {
  it("defaults to off for anything unusable", () => {
    for (const raw of [undefined, null, "", "abc", 3, -1, 1.5, {}]) expect(sanitizeFailedProofMode(raw)).toBe(0);
    expect(sanitizeFailedProofMode(1)).toBe(1);
    expect(sanitizeFailedProofMode("2")).toBe(2);
  });
  it("accepts only 0, 1 or 2 on write", () => {
    expect(parseFailedProofMode(2)).toEqual({ mode: 2 });
    expect(parseFailedProofMode("1")).toEqual({ mode: 1 });
    expect(parseFailedProofMode(0)).toEqual({ mode: 0 });
    for (const bad of [3, -1, "x", null, undefined, 1.5]) expect(parseFailedProofMode(bad).error).toMatch(/0 \(off\)/);
  });
});

describe("decideFailedProof", () => {
  it("mode 0 never asks for anything and ignores whatever was sent", () => {
    expect(decideFailedProof({ ...base, mode: 0, proofUrl: "https://evil.example/x" })).toEqual({ ok: true, proofUrl: null, noPhotoNote: null });
  });
  it("optional: no photo is fine; our photo is kept; a foreign URL is refused", () => {
    expect(decideFailedProof({ ...base, mode: 1 })).toEqual({ ok: true, proofUrl: null, noPhotoNote: null });
    expect(decideFailedProof({ ...base, mode: 1, proofUrl: OURS })).toEqual({ ok: true, proofUrl: OURS, noPhotoNote: null });
    expect(decideFailedProof({ ...base, mode: 1, proofUrl: "https://evil.example/x.jpg" }).ok).toBe(false);
    expect(decideFailedProof({ ...base, mode: 1, proofUrl: "https://res.cloudinary.com/other/x.jpg" }).ok).toBe(false);
  });
  it("optional: a short or long no-photo note is kept only when meaningful", () => {
    expect(decideFailedProof({ ...base, mode: 1, noPhotoReason: "no" })).toMatchObject({ ok: true, noPhotoNote: null });
    expect(decideFailedProof({ ...base, mode: 1, noPhotoReason: "camera broken" })).toMatchObject({ noPhotoNote: "camera broken" });
  });
  it("required: a photo or a ≥5-char reason; neither is refused", () => {
    expect(decideFailedProof({ ...base, mode: 2 }).ok).toBe(false);
    expect(decideFailedProof({ ...base, mode: 2, noPhotoReason: "abc" }).ok).toBe(false);
    expect(decideFailedProof({ ...base, mode: 2, noPhotoReason: "camera broken" })).toMatchObject({ ok: true, proofUrl: null, noPhotoNote: "camera broken" });
    expect(decideFailedProof({ ...base, mode: 2, proofUrl: OURS })).toMatchObject({ ok: true, proofUrl: OURS });
  });
  it("required but uploads are not configured: a photo is impossible, so it is not demanded", () => {
    expect(decideFailedProof({ ...base, mode: 2, uploadsConfigured: false })).toEqual({ ok: true, proofUrl: null, noPhotoNote: null });
  });
});
