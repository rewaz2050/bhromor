import { describe, expect, it } from "vitest";
import { addDays, dayNumber, isValidLicenceExpiry, licenceRiderMessage, licenceStatus } from "../kyc-expiry";

const TODAY = "2026-10-02";

describe("licence dates", () => {
  it("parses only real calendar days", () => {
    expect(dayNumber("2026-10-02")).not.toBeNull();
    expect(dayNumber("2026-02-30")).toBeNull();
    expect(dayNumber("02-10-2026")).toBeNull();
    expect(dayNumber("")).toBeNull();
  });
  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-02", 14)).toBe("2026-10-16");
    expect(addDays("2026-12-25", 14)).toBe("2027-01-08");
  });
  it("accepts plausible expiries only", () => {
    expect(isValidLicenceExpiry("2028-05-01", TODAY)).toBe(true);
    expect(isValidLicenceExpiry("2026-09-01", TODAY)).toBe(true); // already lapsed is still a real date
    expect(isValidLicenceExpiry("1999-01-01", TODAY)).toBe(false);
    expect(isValidLicenceExpiry("2090-01-01", TODAY)).toBe(false);
    expect(isValidLicenceExpiry("nope", TODAY)).toBe(false);
  });
});

describe("licenceStatus", () => {
  it("does not apply to a bicycle", () => {
    expect(licenceStatus("bicycle", "2020-01-01", TODAY)).toEqual({ kind: "na", daysLeft: null, blocked: false });
  });
  it("an unrecorded date never blocks", () => {
    expect(licenceStatus("bike", null, TODAY)).toEqual({ kind: "unrecorded", daysLeft: null, blocked: false });
    expect(licenceStatus("scooter", "garbage", TODAY).blocked).toBe(false);
  });
  it("is ok beyond the warning window, soon within it (inclusive), expired the day after", () => {
    expect(licenceStatus("bike", "2026-10-17", TODAY)).toMatchObject({ kind: "ok", daysLeft: 15 });
    expect(licenceStatus("bike", "2026-10-16", TODAY)).toMatchObject({ kind: "soon", daysLeft: 14 });
    expect(licenceStatus("bike", TODAY, TODAY)).toMatchObject({ kind: "soon", daysLeft: 0, blocked: false });
    expect(licenceStatus("bike", "2026-10-01", TODAY)).toMatchObject({ kind: "expired", daysLeft: -1, blocked: true });
  });
  it("speaks to the rider only when there is something to do", () => {
    expect(licenceRiderMessage(licenceStatus("bike", "2027-10-01", TODAY))).toBeNull();
    expect(licenceRiderMessage(licenceStatus("bike", "2026-10-05", TODAY))).toContain("3 দিন");
    expect(licenceRiderMessage(licenceStatus("bike", TODAY, TODAY))).toContain("আজ");
    expect(licenceRiderMessage(licenceStatus("bike", "2026-09-01", TODAY))).toContain("অনলাইন হওয়া যাবে না");
  });
});
