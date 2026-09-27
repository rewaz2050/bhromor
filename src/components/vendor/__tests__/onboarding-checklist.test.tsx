/**
 * Round 4 (2026-09-26) — the "get your shop ready" card on /vendor.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Product, Shop } from "@/lib/catalog";
import OnboardingChecklist from "../onboarding-checklist";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const shop: Shop = {
  id: "s1",
  slug: "arian",
  name: "Arian",
  phone: "01712345678",
  address: "",
  zoneIds: [],
  prepMinutes: 15,
  commissionPct: 15,
  status: "active",
  isOpen: false,
  ratingAvg: 0,
  ratingCount: 0,
};

const product = (id: string, media = true): Product =>
  ({ id, slug: id, name: id, price: 100, media: media ? [{ src: `https://x/${id}.jpg`, alt: id }] : [] }) as Product;

describe("OnboardingChecklist", () => {
  it("lists what is missing with links, and a button for the open step", () => {
    const onOpenShop = vi.fn();
    render(<OnboardingChecklist shop={shop} products={[product("a")]} loading={false} onOpenShop={onOpenShop} opening={false} />);
    expect(screen.getByRole("heading", { name: /get your shop ready/i })).toBeInTheDocument();
    expect(screen.getByText("1/5 done")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("link", { name: /open shop settings/i })).toHaveAttribute("href", "/vendor/settings");
    expect(screen.getByRole("link", { name: /add another product/i })).toHaveAttribute("href", "/vendor/products");
    fireEvent.click(screen.getByRole("button", { name: /open the shop/i }));
    expect(onOpenShop).toHaveBeenCalled();
    expect(screen.queryByText(/bkash|nagad|payout/i)).not.toBeInTheDocument();
  });

  it("stays hidden while products load and once everything is done", () => {
    const { container, rerender } = render(
      <OnboardingChecklist shop={shop} products={[]} loading onOpenShop={() => undefined} opening={false} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <OnboardingChecklist
        shop={{ ...shop, address: "Kandirpar", tagline: "Fine panjabi", isOpen: true }}
        products={[product("a"), product("b"), product("c")]}
        loading={false}
        onOpenShop={() => undefined}
        opening={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
