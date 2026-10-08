/**
 * The server half of the language choice (fix-all pass 2026-10-07): the
 * storefront layout reads the cookie so the first paint is already in the
 * shopper's language, instead of painting Bangla and swapping.
 */
import { describe, expect, it } from "vitest";
import { LANGUAGE_COOKIE_KEY, languageFromCookie } from "../translations";

describe("languageFromCookie", () => {
  it("reads the two languages it knows", () => {
    expect(languageFromCookie("en")).toBe("en");
    expect(languageFromCookie("bn")).toBe("bn");
  });

  it("answers null for anything else — a first visit is not a choice", () => {
    expect(languageFromCookie(undefined)).toBeNull();
    expect(languageFromCookie("")).toBeNull();
    expect(languageFromCookie("EN")).toBeNull();
    expect(languageFromCookie("fr")).toBeNull();
  });

  it("is the same name the provider writes", () => {
    expect(LANGUAGE_COOKIE_KEY).toBe("prosanti-lang");
  });
});
