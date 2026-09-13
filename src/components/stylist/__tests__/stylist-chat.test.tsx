import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Shop } from "@/lib/catalog";
import { PRODUCTS } from "@/lib/catalog";
import { SIZE_PROFILE_KEY, __resetSizeProfile } from "@/lib/size-finder";
import StylistChat from "../stylist-chat";

afterEach(() => {
  cleanup();
  localStorage.clear();
  __resetSizeProfile();
});

const panjabi = PRODUCTS.find((p) => p.subCategory === "Panjabi")!;
const gamcha = PRODUCTS.find((p) => p.subCategory === "Gamcha")!;

const makeShop = (phone: string): Shop => ({
  id: "shop-1",
  slug: "prosanti-direct",
  name: "PROSANTI Direct",
  phone,
  zoneIds: [],
  prepMinutes: 30,
  commissionPct: 0,
  status: "active",
  isOpen: true,
  ratingAvg: 0,
  ratingCount: 0,
});

const openChat = (props: Partial<Parameters<typeof StylistChat>[0]> = {}) =>
  render(
    <StylistChat
      product={panjabi}
      catalog={PRODUCTS}
      shop={makeShop("01712345678")}
      {...props}
    />,
  );
const ask = (question: string) =>
  fireEvent.click(screen.getByRole("button", { name: question }));

describe("StylistChat", () => {
  it("answers size honestly with no saved body: points to the size finder, invents nothing", () => {
    openChat();
    ask("Ask the stylist");
    ask("Which size fits me?");
    expect(
      screen.getByText(/it answers from the sizes we actually sell/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open size finder" }),
    ).toBeInTheDocument();
    // No invented recommendation:
    expect(screen.queryByText(/% match\./)).not.toBeInTheDocument();
  });

  it("answers size from the customer's own saved body numbers", () => {
    // 101 cm chest sits dead-centre of the M band → verdict "best" (confidence 98: band edges overlap).
    localStorage.setItem(
      SIZE_PROFILE_KEY,
      JSON.stringify({ heightCm: 172, weightKg: 68, fit: "regular", chestCm: 101 }),
    );
    openChat();
    ask("Ask the stylist");
    ask("Which size fits me?");
    expect(screen.getByText("From your saved height & weight: M — 98% match.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Use this size · M" }),
    ).toBeInTheDocument();
  });

  it("selects the suggested size in the purchase panel when 'use it' is tapped", () => {
    localStorage.setItem(
      SIZE_PROFILE_KEY,
      JSON.stringify({ heightCm: 172, weightKg: 68, fit: "regular", chestCm: 101 }),
    );
    const onUseSize = vi.fn();
    openChat({ onUseSize });
    ask("Ask the stylist");
    ask("Which size fits me?");
    fireEvent.click(screen.getByRole("button", { name: "Use this size · M" }));
    expect(onUseSize).toHaveBeenCalledWith("M");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hands off to the size finder without stacking dialogs", () => {
    const onOpenSizeFinder = vi.fn();
    openChat({ onOpenSizeFinder });
    ask("Ask the stylist");
    ask("Which size fits me?");
    fireEvent.click(screen.getByRole("button", { name: "Open size finder" }));
    expect(onOpenSizeFinder).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("hands off to the size & fit guide without stacking dialogs", () => {
    const onOpenSizeGuide = vi.fn();
    openChat({ onOpenSizeGuide });
    ask("Ask the stylist");
    ask("Which size fits me?");
    fireEvent.click(screen.getByRole("button", { name: "Size & fit guide" }));
    expect(onOpenSizeGuide).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("answers pairing from in-stock catalog rows — the real gamcha, no filler", () => {
    openChat();
    ask("Ask the stylist");
    ask("What pairs with this?");
    const link = screen.getByRole("link", { name: new RegExp(gamcha.name) });
    expect(link).toHaveAttribute("href", `/product/${gamcha.slug}`);
  });

  it("answers pairing honestly when nothing in the collection pairs (three-piece → no dupatta/shawl yet)", () => {
    const threePiece = PRODUCTS.find((p) => p.subCategory === "Three-Piece")!;
    openChat({ product: threePiece });
    ask("Ask the stylist");
    ask("What pairs with this?");
    expect(screen.getByText(/Nothing in the collection pairs/)).toBeInTheDocument();
  });

  it("answers stock from the product's real fields", () => {
    openChat();
    ask("Ask the stylist");
    ask("Is it in stock?");
    expect(screen.getByText("Yes — in stock right now.")).toBeInTheDocument();
    expect(screen.getByText(/Forest Green/)).toBeInTheDocument();
  });

  it("the human handoff is a real wa.me link carrying the product and topic", () => {
    openChat();
    ask("Ask the stylist");
    ask("Is it in stock?");
    ask("Ask a real stylist");
    const cta = screen.getByRole("link", { name: "Chat on WhatsApp" });
    const href = cta.getAttribute("href")!;
    expect(href).toMatch(/^https:\/\/wa\.me\/8801712345678\?text=/);
    expect(href).toContain(encodeURIComponent("Heritage Green Panjabi"));
    // The last non-human topic (stock) rides along:
    expect(href).toContain(encodeURIComponent("is it in stock right now"));
  });

  it("without a plausible shop phone, the handoff falls back to the contact page — no chat to nowhere", () => {
    openChat({ shop: makeShop("") });
    ask("Ask the stylist");
    ask("Ask a real stylist");
    expect(
      screen.getByRole("link", { name: /contact page reaches the same team/ }),
    ).toHaveAttribute("href", "/contact");
    expect(
      screen.queryByRole("link", { name: "Chat on WhatsApp" }),
    ).not.toBeInTheDocument();
  });

  it("already-asked topics stay answered and can't spam the chat (human may be re-asked)", () => {
    openChat();
    ask("Ask the stylist");
    const stockChip = screen.getByRole("button", { name: "Is it in stock?" });
    fireEvent.click(stockChip);
    expect(screen.getByText("Yes — in stock right now.")).toBeInTheDocument();
    expect(stockChip).toBeDisabled();
    fireEvent.click(stockChip);
    expect(screen.getAllByText("Yes — in stock right now.")).toHaveLength(1);
    const humanChip = screen.getByRole("button", { name: "Ask a real stylist" });
    fireEvent.click(humanChip);
    fireEvent.click(humanChip);
    expect(screen.getAllByRole("link", { name: "Chat on WhatsApp" })).toHaveLength(2);
  });
});
