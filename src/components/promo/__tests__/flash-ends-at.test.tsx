/** UX plan §3 (R11) — the wall-clock end beside the flash countdown. */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FlashEndsAt } from "@/components/promo/flash-timer";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { endsAtLabel } from "@/lib/ends-at";

afterEach(cleanup);

describe("<FlashEndsAt>", () => {
  it("says WHEN the window ends, in Bengali, in the shop's day", () => {
    const endsAtMs = Date.now() + 2 * 3600_000;
    render(
      <LanguageProvider initialLang="bn">
        <FlashEndsAt endsAtMs={endsAtMs} />
      </LanguageProvider>,
    );
    const el = screen.getByTestId("flash-ends-at");
    expect(el).toHaveAttribute("lang", "bn");
    expect(el.textContent).toBe(`(${endsAtLabel(endsAtMs, "bn")})`);
    expect(el.textContent).toMatch(/টায় শেষ\)$/);
  });

  it("renders nothing once the window has passed", () => {
    render(
      <LanguageProvider initialLang="en">
        <FlashEndsAt endsAtMs={Date.now() - 1000} />
      </LanguageProvider>,
    );
    expect(screen.queryByTestId("flash-ends-at")).toBeNull();
  });
});
