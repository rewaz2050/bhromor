/**
 * Owner decision (2026-10-27): counter pickups stay at **Traffic Point**.
 * They must not silently become "collect from the shop location".
 *
 * These tests pin both the shared value and the pickup-facing screens, so a
 * future refactor that renders the shop's own address as the collection point
 * fails here instead of sending a customer to the wrong place.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import {
  PICKUP_LOCATION_KIND,
  PICKUP_LOCATION_LABEL,
  PICKUP_LOCATION_LINE,
  pickupLocationIsApprovedHub,
} from "../pickup-location";
import { SUNAMGANJ_HUB } from "../sunamganj";
import PickupHandover from "@/components/admin/pickup-handover";

const source = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("pickup location decision", () => {
  it("is Traffic Point, not a shop location", () => {
    expect(PICKUP_LOCATION_KIND).toBe("traffic-point");
    expect(PICKUP_LOCATION_LABEL).toBe("Traffic Point");
    expect(PICKUP_LOCATION_LABEL).toBe(SUNAMGANJ_HUB);
    expect(PICKUP_LOCATION_LINE).toContain("Traffic Point");
    expect(PICKUP_LOCATION_LINE).toContain("সুনামগঞ্জ সদর");
    expect(pickupLocationIsApprovedHub()).toBe(true);
  });

  it("keeps the staff handover copy on the hub and never renders the stored PIN", () => {
    const verify = vi.fn(async () => true);
    render(<PickupHandover verify={verify} override={vi.fn(async () => true)} />);
    expect(screen.getByText(/Pickup at Traffic Point/)).toBeTruthy();
    expect(screen.getByText(/সুনামগঞ্জ সদর থেকে সংগ্রহ/)).toBeTruthy();
    expect(screen.queryByDisplayValue("4821")).toBeNull();
    fireEvent.change(screen.getByLabelText("Customer PIN / কাস্টমারের PIN"), {
      target: { value: "4821" },
    });
    expect(screen.queryByText(/4821/)).toBeNull();
  });

  it("renders the hub, never the shop address, on the customer/staff screens", () => {
    const files = [
      "../../components/checkout/order-summary-card.tsx",
      "../../components/track/order-now-banner.tsx",
      "../../app/admin/orders/[id]/page.tsx",
      "../../app/vendor/orders/[id]/page.tsx",
      "../../components/admin/pickup-handover.tsx",
    ];
    for (const file of files) {
      const text = source(file);
      // These screens may mention "Traffic Point"/the hub constant, or pull
      // the approved label from the shared module — but not a shop address.
      expect(text, `${file}: pickup copy must name the approved hub`).toMatch(
        /Traffic Point|SUNAMGANJ_HUB|PICKUP_LOCATION_(LINE|LABEL)/,
      );
      expect(text, `${file}: pickup must not use the shop address`).not.toMatch(
        /pickup[^"\n]{0,40}\$\{[^}]*shop\.address|shop\.address[^"\n]{0,40}pickup/i,
      );
    }
  });
});
