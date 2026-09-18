/**
 * P2 #20 — the strip under the hero answers "do you deliver to my para, for
 * how much?" from the same zone table the checkout prices from, and sets the
 * shopper's zone so /shop opens scoped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import HomeDeliveryCheck, { findZoneForPara } from "@/components/home/home-delivery-check";
import { DELIVERY_ZONES } from "@/lib/catalog";
import { formatBdt } from "@/lib/format";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

beforeEach(() => {
  window.localStorage.clear();
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

describe("findZoneForPara", () => {
  it("matches exact, case-insensitive and partial para names", () => {
    const zoneA = DELIVERY_ZONES[0];
    const para = zoneA.areas[0];
    expect(findZoneForPara(DELIVERY_ZONES, para)?.id).toBe(zoneA.id);
    expect(findZoneForPara(DELIVERY_ZONES, para.toLowerCase())?.id).toBe(zoneA.id);
    expect(findZoneForPara(DELIVERY_ZONES, `${para} bazar`)?.id).toBe(zoneA.id);
    expect(findZoneForPara(DELIVERY_ZONES, "")).toBeNull();
    expect(findZoneForPara(DELIVERY_ZONES, "Dhaka Gulshan")).toBeNull();
  });
});

describe("HomeDeliveryCheck", () => {
  it("shows four linked trust pills", () => {
    render(<HomeDeliveryCheck />);
    const pills = screen.getByTestId("trust-pills");
    const links = pills.querySelectorAll("a");
    expect(links).toHaveLength(4);
    expect(pills.textContent).toMatch(/Cash on delivery/);
    expect(pills.textContent).toMatch(/Delivery from ৳60/);
    expect(pills.textContent).toMatch(/4-digit delivery PIN/);
    expect(pills.textContent).toMatch(/7-day easy returns/);
    expect(screen.getByRole("link", { name: /7-day easy returns/ })).toHaveAttribute("href", "/returns");
  });

  it("quotes the real zone charge + ETA for a known para and scopes the shop", () => {
    render(<HomeDeliveryCheck />);
    const zoneA = DELIVERY_ZONES[0];
    fireEvent.change(screen.getByLabelText(/Do we deliver to your para\?/), {
      target: { value: zoneA.areas[1] },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    const result = screen.getByTestId("home-delivery-result");
    expect(result.textContent).toContain("Zone A");
    expect(result.textContent).toContain(formatBdt(zoneA.charge));
    expect(result.textContent).toContain(zoneA.etaLabel);
    expect(screen.getByRole("link", { name: /Shop for this area/ })).toHaveAttribute("href", "/shop");
    // The "deliver to" zone is remembered for /shop.
    expect(window.localStorage.getItem("prosanti.myzone.v1")).toContain(zoneA.id);
  });

  it("says courier days (not minutes) for Zone D and is honest about unknown paras", () => {
    render(<HomeDeliveryCheck />);
    const zoneD = DELIVERY_ZONES.find((z) => z.id === "z4")!;
    const input = screen.getByLabelText(/Do we deliver to your para\?/);
    fireEvent.change(input, { target: { value: zoneD.areas[0] } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByTestId("home-delivery-result").textContent).toMatch(/1–3 days by courier/);
    expect(screen.getByTestId("home-delivery-result").textContent).not.toMatch(/60–80 min/);

    fireEvent.change(input, { target: { value: "Somewhere Else" } });
    // Typing clears the previous answer.
    expect(screen.getByTestId("home-delivery-result").textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByTestId("home-delivery-result").textContent).toMatch(/Not on our list yet/);
    expect(screen.getByTestId("home-delivery-result").textContent).toMatch(/min\. order ৳500/);
  });
});
