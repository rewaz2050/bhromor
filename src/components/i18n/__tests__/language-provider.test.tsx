/**
 * The language provider and the server's answer (fix-all + flicker pass
 * 2026-10-07).
 *
 * The storefront's layout reads the cookie and passes the language down, so
 * the page arrives in the shopper's language. The provider's job is to agree
 * with it — not to re-decide after hydration, and not to re-write storage on
 * every page load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import {
  LanguageProvider,
  LANGUAGE_STORAGE_KEY,
  useLanguage,
} from "@/components/i18n/language-provider";

const KEY = LANGUAGE_STORAGE_KEY;

beforeEach(() => {
  localStorage.clear();
  document.cookie = `${KEY}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
});

afterEach(cleanup);

/** Shows the live language and a switch, the way the header does. */
function Probe() {
  const { lang, setLang, t } = useLanguage();
  return (
    <div>
      <span data-testid="lang">{lang}</span>
      <span data-testid="greeting">{t("nav.shop")}</span>
      <button type="button" onClick={() => setLang(lang === "bn" ? "en" : "bn")}>
        switch
      </button>
    </div>
  );
}

describe("LanguageProvider", () => {
  it("keeps the language the server rendered and writes nothing", () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    render(
      <LanguageProvider initialLang="bn">
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("bn");
    expect(screen.getByTestId("greeting").textContent).toBe("কেনাকাটা");
    // A page load is not a choice — nothing is re-stored.
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });

  it("writes once when the shopper actually switches", () => {
    localStorage.setItem(KEY, "bn");
    render(
      <LanguageProvider initialLang="bn">
        <Probe />
      </LanguageProvider>,
    );
    act(() => {
      screen.getByText("switch").click();
    });
    expect(screen.getByTestId("lang").textContent).toBe("en");
    expect(localStorage.getItem(KEY)).toBe("en");
    expect(document.cookie).toContain(`${KEY}=en`);
  });

  it("brings back the choice the server could not see", () => {
    // The cookie was blocked on this device but localStorage remembers: the
    // server painted Bangla, the device wants English.
    localStorage.setItem(KEY, "en");
    render(
      <LanguageProvider initialLang="bn">
        <Probe />
      </LanguageProvider>,
    );
    expect(screen.getByTestId("lang").textContent).toBe("en");
  });

  it("leaves <html lang> alone when the choice already matches", () => {
    localStorage.setItem(KEY, "bn");
    render(
      <LanguageProvider initialLang="bn">
        <Probe />
      </LanguageProvider>,
    );
    expect(document.documentElement.lang).toBe("bn");
  });
});
