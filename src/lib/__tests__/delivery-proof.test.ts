import { describe, expect, it } from "vitest";
import { decideProof, isCloudinaryProofUrl } from "../delivery-proof";

const CLOUD = "prosanti-demo";
const OURS = `https://res.cloudinary.com/${CLOUD}/image/upload/v17/prosanti/delivery-proofs/abc.jpg`;

describe("isCloudinaryProofUrl (audit N9)", () => {
  it("accepts our own Cloudinary cloud only", () => {
    expect(isCloudinaryProofUrl(OURS, CLOUD)).toBe(true);
    expect(isCloudinaryProofUrl(OURS.replace(CLOUD, "someone-else"), CLOUD)).toBe(false);
  });

  it("is case-insensitive on the cloud name but strict on host and scheme", () => {
    expect(isCloudinaryProofUrl(OURS, CLOUD.toUpperCase())).toBe(true);
    expect(isCloudinaryProofUrl(OURS.replace("https", "http"), CLOUD)).toBe(false);
    expect(isCloudinaryProofUrl("https://evil.example/res.cloudinary.com/prosanti-demo/x.jpg", CLOUD)).toBe(false);
    expect(isCloudinaryProofUrl(`https://res.cloudinary.com.evil.example/${CLOUD}/x.jpg`, CLOUD)).toBe(false);
    expect(isCloudinaryProofUrl(`https://user:pw@res.cloudinary.com/${CLOUD}/x.jpg`, CLOUD)).toBe(false);
    expect(isCloudinaryProofUrl(`https://res.cloudinary.com/${CLOUD}-evil/x.jpg`, CLOUD)).toBe(false);
  });

  it("rejects garbage and an unknown cloud", () => {
    expect(isCloudinaryProofUrl("not a url", CLOUD)).toBe(false);
    expect(isCloudinaryProofUrl(OURS, null)).toBe(false);
  });
});

describe("decideProof", () => {
  const base = { cloudName: CLOUD, uploadsConfigured: true };

  it("passes a genuine Cloudinary proof", () => {
    expect(decideProof({ ...base, proofUrl: ` ${OURS} `, noPhotoReason: undefined })).toEqual({
      ok: true,
      proofUrl: OURS,
      noPhotoReason: null,
    });
  });

  it("refuses any other URL, even when a reason is given", () => {
    const r = decideProof({ ...base, proofUrl: "https://example.com/stock.jpg", noPhotoReason: "broken camera" });
    expect(r.ok).toBe(false);
  });

  it("requires a photo when uploads are configured", () => {
    expect(decideProof({ ...base, proofUrl: null, noPhotoReason: undefined }).ok).toBe(false);
    expect(decideProof({ ...base, proofUrl: "", noPhotoReason: "no" }).ok).toBe(false);
  });

  it("accepts a stated reason instead of a photo (field failures must not strand a parcel)", () => {
    expect(decideProof({ ...base, proofUrl: null, noPhotoReason: " camera is broken " })).toEqual({
      ok: true,
      proofUrl: null,
      noPhotoReason: "camera is broken",
    });
  });

  it("does not demand an impossible photo when uploads are not configured", () => {
    expect(
      decideProof({ cloudName: null, uploadsConfigured: false, proofUrl: null, noPhotoReason: null }),
    ).toEqual({ ok: true, proofUrl: null, noPhotoReason: null });
    // …but a URL still cannot be smuggled in
    expect(
      decideProof({ cloudName: null, uploadsConfigured: false, proofUrl: OURS, noPhotoReason: null }).ok,
    ).toBe(false);
  });
});
