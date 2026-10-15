/**
 * Return / exchange panel for Bangla shoppers: status labels, reasons,
 * headings and the form button come from the Bangla copy, not English.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Order } from "@/lib/orders";
import { LanguageProvider } from "@/components/i18n/language-provider";
import ReturnPanel from "../return-panel";

afterEach(() => cleanup());

const DAY = 24 * 60 * 60 * 1000;

const makeOrder = (over: Partial<Order> = {}): Order => ({
  id: "PS-20260910-0001",
  createdAt: Date.now() - 9 * DAY,
  customer: { name: "Test Customer", phone: "01712345678", area: "Test Area" },
  zoneId: "z1",
  zoneName: "Sunamganj Sadar",
  etaLabel: "same day",
  items: [
    {
      productId: "p1",
      slug: "heritage-green-panjabi",
      name: "Heritage Green Panjabi",
      sku: "PS-MN-001",
      variant: "M",
      qty: 1,
      unitPrice: 125000,
      image: "",
    },
  ],
  subtotal: 125000,
  deliveryCharge: 0,
  total: 125000,
  payment: "cod",
  status: "delivered",
  timeline: [
    { status: "pending", at: Date.now() - 9 * DAY },
    { status: "delivered", at: Date.now() - 2 * DAY },
  ],
  ...over,
});

const renderBn = (order: Order) =>
  render(
    <LanguageProvider initialLang="bn">
      <ReturnPanel order={order} onTrack={() => {}} />
    </LanguageProvider>,
  );

describe("ReturnPanel — Bangla", () => {
  it("shows the pickup leg status and heading in Bangla", () => {
    renderBn(
      makeOrder({
        id: "PS-20260912-0007",
        isReturn: true,
        returnReason: "Wrong / uncomfortable size",
        returnStatus: "approved",
        returnParentOrderNo: "PS-20260910-0001",
        timeline: [{ status: "ready-for-pickup", at: Date.now() }],
      }),
    );
    expect(screen.getByText("ফেরত / বদল পিকআপ")).toBeInTheDocument();
    expect(screen.getByText("অনুমোদিত — পিকআপ পথে")).toBeInTheDocument();
    expect(screen.getByText(/আপনার ঠিকানা থেকে পণ্য নিতে/)).toBeInTheDocument();
    expect(screen.queryByText("Approved — pickup on the way")).toBeNull();
  });

  it("shows the Bangla return reasons and the home-pickup button", () => {
    renderBn(makeOrder());
    expect(
      screen.getByRole("radio", { name: "সাইজ ঠিক নয় / আরামদায়ক নয়" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "বাসা থেকে পিকআপ চাই" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Request home pickup")).toBeNull();
  });
});
