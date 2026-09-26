/**
 * UX plan §1.2 (R3) — the "Area: … ▾" pill: reads and writes the one
 * remembered delivery zone every other surface uses, in one tap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ZonePill from "@/components/layout/zone-pill";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { DELIVERY_ZONES } from "@/lib/catalog";
import { MY_ZONE_KEY } from "@/lib/use-my-zone";

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  window.localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) =>
      Promise.resolve(
        String(input).includes("/api/zones")
          ? jsonResponse({ source: "live", zones: DELIVERY_ZONES })
          : jsonResponse({}),
      ),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ZonePill", () => {
  it("asks for the area first, then remembers the pick where checkout reads it", async () => {
    render(
      <LanguageProvider initialLang="en">
        <ZonePill />
      </LanguageProvider>,
    );
    const select = screen.getByRole("combobox", { name: "Choose your area" });
    expect(select).toHaveValue("");
    expect(screen.getByRole("option", { name: "Your area?" })).toBeInTheDocument();
    fireEvent.change(select, { target: { value: DELIVERY_ZONES[1].id } });
    expect(window.localStorage.getItem(MY_ZONE_KEY)).toBe(DELIVERY_ZONES[1].id);
    await waitFor(() => expect(screen.getByRole("combobox", { name: "Change area" })).toHaveValue(DELIVERY_ZONES[1].id));
    expect(screen.getByTestId("zone-pill")).toHaveAttribute("data-zone", DELIVERY_ZONES[1].id);
    expect(screen.getByRole("option", { name: `Area: ${DELIVERY_ZONES[1].name}` })).toBeInTheDocument();
  });

  it("starts from the remembered zone, in Bengali", () => {
    window.localStorage.setItem(MY_ZONE_KEY, DELIVERY_ZONES[0].id);
    render(
      <LanguageProvider initialLang="bn">
        <ZonePill tone="dark" />
      </LanguageProvider>,
    );
    expect(screen.getByRole("combobox")).toHaveValue(DELIVERY_ZONES[0].id);
    expect(screen.getByRole("option", { name: "আপনার এলাকা?" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "" } });
    expect(window.localStorage.getItem(MY_ZONE_KEY)).toBeNull();
  });
});
