/**
 * The sentence the board says before a rider rides home with the shop's cash.
 */
import { describe, expect, it } from "vitest";
import { offlineCashNote } from "../rider-tasks";

describe("offlineCashNote", () => {
  it("says how much is in the pocket and what to do with it", () => {
    expect(offlineCashNote(220000)).toBe(
      "হাতে ৳2,200 ক্যাশ আছে — অফলাইন যাওয়ার আগে জমা দিয়ে যান।",
    );
  });

  it("says nothing when there is nothing to hand over", () => {
    expect(offlineCashNote(0)).toBeNull();
    expect(offlineCashNote(-500)).toBeNull();
  });

  it("writes English in English", () => {
    expect(offlineCashNote(120000, "en")).toBe(
      "You are holding ৳1,200 in COD cash — settle before going offline.",
    );
  });
});
