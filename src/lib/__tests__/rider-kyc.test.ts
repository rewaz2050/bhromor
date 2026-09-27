/**
 * Round 4 (2026-09-26) — rider KYC vocabulary: which documents a rider
 * must supply, how progress is counted, and which URLs the API accepts.
 */
import { describe, expect, it } from "vitest";
import {
  KYC_DOCS,
  isAcceptableKycUrl,
  isKycDocId,
  kycProgress,
  normalizeKyc,
  requiredKycDocs,
} from "../rider-kyc";

const URL_OK = "https://res.cloudinary.com/demo/image/upload/v1/prosanti/rider-kyc/a.jpg";

describe("requiredKycDocs", () => {
  it("asks bicycle riders for NID + selfie only, motorised riders for the licence too", () => {
    expect(requiredKycDocs("bicycle")).toEqual(["nid_front", "nid_back", "selfie"]);
    expect(requiredKycDocs("bike")).toEqual(["nid_front", "nid_back", "selfie", "license"]);
    expect(requiredKycDocs("scooter")).toContain("license");
  });

  it("labels every document in both languages", () => {
    for (const doc of KYC_DOCS) {
      expect(doc.bn.length).toBeGreaterThan(3);
      expect(doc.en.length).toBeGreaterThan(3);
      expect(isKycDocId(doc.id)).toBe(true);
    }
    expect(isKycDocId("passport")).toBe(false);
  });
});

describe("normalizeKyc / kycProgress", () => {
  it("keeps only known documents with https URLs", () => {
    expect(
      normalizeKyc({ nid_front: URL_OK, selfie: "http://insecure", passport: URL_OK, license: 42 }),
    ).toEqual({ nid_front: URL_OK });
    expect(normalizeKyc(null)).toEqual({});
    expect(normalizeKyc("nope")).toEqual({});
  });

  it("counts required documents only and flags completion", () => {
    const partial = kycProgress({ nid_front: URL_OK, license: URL_OK }, "bicycle");
    expect(partial).toEqual({
      required: ["nid_front", "nid_back", "selfie"],
      done: ["nid_front"],
      missing: ["nid_back", "selfie"],
      complete: false,
    });
    const full = kycProgress({ nid_front: URL_OK, nid_back: URL_OK, selfie: URL_OK }, "bicycle");
    expect(full.complete).toBe(true);
    // The same set is NOT complete for a motorbike rider.
    expect(kycProgress({ nid_front: URL_OK, nid_back: URL_OK, selfie: URL_OK }, "bike").missing).toEqual(["license"]);
    expect(kycProgress(undefined, "bike").done).toEqual([]);
  });
});

describe("isAcceptableKycUrl", () => {
  it("accepts only Cloudinary image delivery URLs for our cloud", () => {
    expect(isAcceptableKycUrl(URL_OK, "demo")).toBe(true);
    expect(isAcceptableKycUrl(URL_OK, null)).toBe(true);
    expect(isAcceptableKycUrl(URL_OK, "other-cloud")).toBe(false);
    expect(isAcceptableKycUrl("https://res.cloudinary.com/demo/video/upload/v1/a.mp4", "demo")).toBe(false);
    expect(isAcceptableKycUrl("http://res.cloudinary.com/demo/image/upload/v1/a.jpg", "demo")).toBe(false);
    expect(isAcceptableKycUrl("https://evil.example/res.cloudinary.com/demo/image/upload/a.jpg", "demo")).toBe(false);
    expect(isAcceptableKycUrl("not a url", "demo")).toBe(false);
    expect(isAcceptableKycUrl(`${URL_OK}?${"x".repeat(700)}`, "demo")).toBe(false);
  });
});
