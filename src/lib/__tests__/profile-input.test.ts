import { describe, expect, it } from "vitest";
import { profileBody, profileName, riderProfileInput } from "../profile-input";

describe("profile input whitelist", () => {
  it("normalizes a valid name", () => expect(profileName("  Rahim   Ahmed ")).toBe("Rahim Ahmed"));
  it.each([null, [], "name", 5])("rejects malformed bodies", raw => expect(() => profileBody(raw, ["name"])).toThrow());
  it.each(["", "a", "a".repeat(81)])("rejects invalid names", name => expect(() => profileName(name)).toThrow());
  it.each(["id", "status", "zone_ids", "cash_in_hand", "user_id", "is_online"])("does not accept %s from a rider", key => {
    expect(() => riderProfileInput({ name: "Rahim", phone: "01712345678", vehicle: "bike", [key]: "changed" })).toThrow();
  });
  it("validates phone and vehicle", () => {
    expect(() => riderProfileInput({ name: "Rahim", phone: "123", vehicle: "bike" })).toThrow();
    expect(() => riderProfileInput({ name: "Rahim", phone: "01712345678", vehicle: "plane" })).toThrow();
    expect(riderProfileInput({ name: "Rahim", phone: "01712345678", vehicle: "bike" })).toEqual({ name: "Rahim", phone: "01712345678", vehicle: "bike" });
  });
});
