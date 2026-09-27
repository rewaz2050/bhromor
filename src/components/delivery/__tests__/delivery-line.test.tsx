/**
 * UX plan §4 (2026-09-26) — the PDP's personal delivery line: the shopper's
 * remembered zone, its real charge, COD and the free-delivery threshold; a
 * picker when no zone is remembered; the courier story for z4.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DeliveryLine from "@/components/delivery/delivery-line";
import { DELIVERY_ZONES } from "@/lib/catalog";
import { MY_ZONE_KEY } from "@/lib/use-my-zone";
import { SETTINGS_DEFAULTS, type AdminSettings } from "@/lib/settings-store";
import { LanguageProvider } from "@/components/i18n/language-provider";

const settingsRef: { current: AdminSettings } = { current: SETTINGS_DEFAULTS };
vi.mock("@/lib/use-public-settings", () => ({
  usePublicSettings: () => ({ settings: settingsRef.current, loading: false }),
}));
vi.mock("@/lib/use-live-zones", async () => {
  const { DELIVERY_ZONES } = await import("@/lib/catalog");
  return {
    useLiveZones: () => ({
      zones: DELIVERY_ZONES,
      activeZones: DELIVERY_ZONES.filter((z) => z.active !== false),
      settled: true,
      live: false,
    }),
  };
});

const z1 = DELIVERY_ZONES.find((z) => z.id === "z1")!;
const z4 = DELIVERY_ZONES.find((z) => z.id === "z4")!;

beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  settingsRef.current = SETTINGS_DEFAULTS;
});
afterEach(cleanup);

const mount = (shopMin: number | null = null, lang: "en" | "bn" = "en") =>
  render(
    <LanguageProvider initialLang={lang}>
      <DeliveryLine shop={{ freeDeliveryMinPaisa: shopMin }} />
    </LanguageProvider>,
  );

describe("DeliveryLine", () => {
  it("asks 'do we deliver to you?' with a zone picker when no zone is remembered", () => {
    mount();
    const line = screen.getByTestId("delivery-line");
    expect(line).toHaveAttribute("data-zone", "");
    expect(line).toHaveTextContent(/do we deliver to you\?/i);
    const select = screen.getByTestId("delivery-line-zone") as HTMLSelectElement;
    expect(select.value).toBe("");
    // picking a zone writes the shared remembered zone
    fireEvent.change(select, { target: { value: z1.id } });
    expect(localStorage.getItem(MY_ZONE_KEY)).toBe(z1.id);
    expect(screen.getByTestId("delivery-line")).toHaveAttribute("data-zone", z1.id);
  });

  it("names the remembered rider zone, its charge, COD — and the free-delivery threshold when armed", () => {
    localStorage.setItem(MY_ZONE_KEY, z1.id);
    const { unmount } = mount();
    let line = screen.getByTestId("delivery-line");
    expect(line).toHaveTextContent(`Delivery to ${z1.name}: ৳60`);
    expect(line).toHaveTextContent(/cash on delivery/i);
    expect(line).not.toHaveTextContent(/free over/i);
    unmount();
    mount(99_900);
    line = screen.getByTestId("delivery-line");
    expect(line).toHaveTextContent("free over ৳999");
  });

  it("tells the courier story for the outside zone: charge, days, minimum order", () => {
    localStorage.setItem(MY_ZONE_KEY, z4.id);
    mount(99_900);
    const line = screen.getByTestId("delivery-line");
    expect(line).toHaveTextContent(/courier ৳150/i);
    expect(line).toHaveTextContent(/min\. order ৳500/i);
    // never a free-delivery promise on the courier leg
    expect(line).not.toHaveTextContent(/free over/i);
  });

  it("uses Bengali digits in Bengali", () => {
    localStorage.setItem(MY_ZONE_KEY, z1.id);
    mount(99_900, "bn");
    const line = screen.getByTestId("delivery-line");
    expect(line).toHaveTextContent("৳৬০");
    expect(line).toHaveTextContent("৳৯৯৯+");
    expect(line.querySelector("span > span")?.textContent ?? "").not.toMatch(/\d/);
  });
});
