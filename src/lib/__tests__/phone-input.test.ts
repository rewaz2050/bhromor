/**
 * P2 #25 — `tidyPhoneInput` keeps what a BD mobile number actually has while
 * the customer types; validation is still `isPlausibleBdPhone`.
 */
import { describe, expect, it } from "vitest";
import { asciiDigits, isPlausibleBdPhone, tidyPhoneInput } from "@/lib/phone";

describe("tidyPhoneInput", () => {
  it("keeps a plain local number as typed", () => {
    expect(tidyPhoneInput("01712345678")).toBe("01712345678");
    expect(tidyPhoneInput("017")).toBe("017");
    expect(tidyPhoneInput("")).toBe("");
  });

  it("strips the country code, spaces, dashes and brackets", () => {
    expect(tidyPhoneInput("+8801712345678")).toBe("01712345678");
    expect(tidyPhoneInput("8801712345678")).toBe("01712345678");
    expect(tidyPhoneInput("+880 17-1234 5678")).toBe("01712345678");
    expect(tidyPhoneInput("(017) 1234-5678")).toBe("01712345678");
  });

  it("converts Bangla-keyboard digits", () => {
    expect(asciiDigits("০১৭১২৩৪৫৬৭৮")).toBe("01712345678");
    expect(tidyPhoneInput("০১৭১২৩৪৫৬৭৮")).toBe("01712345678");
    expect(tidyPhoneInput("+৮৮০১৭১২৩৪৫৬৭৮")).toBe("01712345678");
  });

  it("caps at 11 digits instead of letting a typo through", () => {
    expect(tidyPhoneInput("017123456789")).toBe("01712345678");
    expect(isPlausibleBdPhone(tidyPhoneInput("017123456789"))).toBe(true);
  });

  it("does not eat a number that merely starts with 88 locally", () => {
    // 11 digits starting with 88 is not a BD mobile anyway, but tidy must not
    // chop it to 9 digits and pretend — leave it for validation to reject.
    expect(tidyPhoneInput("88012345678")).toBe("88012345678");
    expect(isPlausibleBdPhone("88012345678")).toBe(false);
  });
});
