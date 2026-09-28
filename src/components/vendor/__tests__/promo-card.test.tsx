/**
 * B3 (2026-09-28) — the promo card.
 *
 * What a shop can be misled about here is money, so the tests hold the card to
 * three things: the arithmetic on screen matches the ledger's rule (the
 * discount leaves the SHOP's share, the commission does not move), the caps
 * are printed before the refusal, and a save that fails keeps everything the
 * shop typed.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import PromoCard from "@/components/vendor/promo-card";
import { DEFAULT_PROMO_LIMITS } from "@/lib/vendor-promo";
import type { VendorPromoRow } from "@/lib/use-vendor";

afterEach(cleanup);

const promo = (over: Partial<VendorPromoRow> = {}): VendorPromoRow => ({
  id: over.id ?? "c1",
  code: over.code ?? "EID10",
  type: "percent",
  value: 10,
  minOrder: 0,
  usageLimit: 50,
  used: over.used ?? 7,
  active: over.active ?? true,
  validUntil: Date.parse("2026-10-12T00:00:00Z"),
  ...over,
});

const props = (over: Partial<Parameters<typeof PromoCard>[0]> = {}) => ({
  promos: [promo()],
  limits: DEFAULT_PROMO_LIMITS,
  usedTotal: 7,
  discountBornePaisa: 15_000,
  commissionPct: 15,
  onCreate: vi.fn(async (draft: Record<string, unknown>) => promo({ code: String(draft.code) })),
  onToggle: vi.fn(async (id: string, active: boolean) => promo({ id, active })),
  ...over,
});

describe("PromoCard (B3)", () => {
  it("shows what the codes have cost, and the platform's caps", () => {
    render(<PromoCard {...props()} />);
    const totals = screen.getByTestId("promo-totals");
    expect(totals).toHaveTextContent("Discount given (your share)");
    expect(totals).toHaveTextContent("৳150");
    expect(totals).toHaveTextContent("Times used");
    const caps = screen.getByTestId("promo-caps");
    expect(caps).toHaveTextContent("25%");
    expect(caps).toHaveTextContent("30 days");
    expect(caps).toHaveTextContent("300");
  });

  it("prices the typed code before anything is saved", () => {
    render(<PromoCard {...props()} />);
    // Default draft: 10% off, 15% commission, sample order ৳1,200.
    const preview = screen.getByTestId("promo-preview");
    expect(preview).toHaveTextContent("Shopper saves ৳120");
    expect(preview).toHaveTextContent("Your share ৳900 (was ৳1,020)");
    expect(preview).toHaveTextContent("Platform commission ৳180");
    expect(preview).toHaveTextContent("13.3% more orders");

    // A 25% code changes the picture, and the commission stays put.
    fireEvent.change(screen.getByTestId("promo-value"), { target: { value: "25" } });
    expect(screen.getByTestId("promo-preview")).toHaveTextContent("Shopper saves ৳300");
    expect(screen.getByTestId("promo-preview")).toHaveTextContent("Your share ৳720");
    expect(screen.getByTestId("promo-preview")).toHaveTextContent("Platform commission ৳180");
  });

  it("keeps the save button shut past a cap and says which cap", () => {
    render(<PromoCard {...props()} />);
    fireEvent.change(screen.getByTestId("promo-code"), { target: { value: "EID60" } });
    fireEvent.change(screen.getByTestId("promo-value"), { target: { value: "60" } });
    expect(screen.getByTestId("promo-save")).toBeDisabled();
    expect(screen.getByTestId("promo-hint")).toHaveTextContent("25%");

    fireEvent.change(screen.getByTestId("promo-value"), { target: { value: "10" } });
    fireEvent.change(screen.getByTestId("promo-days"), { target: { value: "90" } });
    expect(screen.getByTestId("promo-save")).toBeDisabled();
    expect(screen.getByTestId("promo-hint")).toHaveTextContent("30 days");
  });

  it("creates the code the shop typed and clears the form", async () => {
    const onCreate = vi.fn(async (draft: Record<string, unknown>) => promo({ code: String(draft.code) }));
    render(<PromoCard {...props({ onCreate })} />);
    fireEvent.change(screen.getByTestId("promo-code"), { target: { value: "eid10" } });
    fireEvent.change(screen.getByTestId("promo-value"), { target: { value: "12" } });
    fireEvent.change(screen.getByTestId("promo-min"), { target: { value: "1000" } });
    fireEvent.click(screen.getByTestId("promo-save"));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("EID10 is saved"));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ code: "EID10", value: "12", minOrder: "1000" }),
    );
    expect(screen.getByTestId("promo-code")).toHaveValue("");
  });

  it("keeps the typed code and says why when the save fails", async () => {
    const onCreate = vi.fn(async () => {
      throw new Error("at most 3 live promos per shop");
    });
    render(<PromoCard {...props({ onCreate })} />);
    fireEvent.change(screen.getByTestId("promo-code"), { target: { value: "FOURTH" } });
    fireEvent.click(screen.getByTestId("promo-save"));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("at most 3 live promos per shop"),
    );
    expect(screen.getByTestId("promo-code")).toHaveValue("FOURTH");
  });

  it("lists the codes with their state and their remaining redemptions", () => {
    render(
      <PromoCard
        {...props({
          promos: [
            promo({ code: "LIVE10", used: 3 }),
            promo({ id: "c2", code: "USEDUP", used: 50, usageLimit: 50 }),
            promo({ id: "c3", code: "PAUSED", active: false }),
          ],
        })}
      />,
    );
    const live = screen.getByTestId("promo-row-LIVE10");
    expect(live).toHaveTextContent("10% off");
    expect(live).toHaveTextContent("Live");
    expect(live).toHaveTextContent("3 used · 47 left");
    expect(screen.getByTestId("promo-row-USEDUP")).toHaveTextContent("Fully used");
    expect(screen.getByTestId("promo-row-PAUSED")).toHaveTextContent("Paused");
  });

  it("pauses and resumes through the same control", async () => {
    const onToggle = vi.fn(async (id: string, active: boolean) => promo({ id, active }));
    render(<PromoCard {...props({ onToggle })} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith("c1", false));
  });
});
