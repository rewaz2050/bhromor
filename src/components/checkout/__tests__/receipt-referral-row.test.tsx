/**
 * Receipt referral row — the ask lands the moment an order is placed:
 * guests get a quiet sign-in line, signed-in shoppers get their real code
 * with copy + WhatsApp share.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ReceiptReferralRow from "@/components/checkout/receipt-referral-row";
import { LanguageProvider } from "@/components/i18n/language-provider";

vi.mock("@/components/account/customer-provider", () => ({
  useCustomer: () => ({ customer: customerFixture }),
}));

let customerFixture: { id: string } | null = null;
let payload: Record<string, unknown> | null = {
  display: "PS-K4WB2X",
  link: "https://prosanti.store/shop?ref=K4WB2X",
  friendRewardPaisa: 5000,
  referrerRewardPaisa: 5000,
};

beforeEach(() => {
  customerFixture = null;
  payload = {
    display: "PS-K4WB2X",
    link: "https://prosanti.store/shop?ref=K4WB2X",
    friendRewardPaisa: 5000,
    referrerRewardPaisa: 5000,
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve(payload) }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

const renderRow = () =>
  render(
    <LanguageProvider>
      <ReceiptReferralRow />
    </LanguageProvider>,
  );

describe("ReceiptReferralRow — the share ask on the receipt", () => {
  it("guests get a sign-in line, never a mintable code", async () => {
    renderRow();
    expect(screen.getByTestId("receipt-referral-signin")).toBeVisible();
    expect(
      screen.getByTestId("receipt-referral-signin-link"),
    ).toHaveAttribute("href", "/account");
    expect(screen.queryByTestId("receipt-referral-code")).toBeNull();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("signed-in shoppers get their code, a copy button and a WhatsApp share", async () => {
    customerFixture = { id: "c-1" };
    renderRow();
    const code = await screen.findByTestId("receipt-referral-code");
    expect(code).toHaveTextContent("PS-K4WB2X");
    const wa = screen.getByTestId("receipt-referral-wa");
    expect(wa).toHaveAttribute("target", "_blank");
    expect(wa.getAttribute("href")).toContain("https://wa.me/?text=");
    expect(wa.getAttribute("href")).toContain(encodeURIComponent("PS-K4WB2X"));
    expect(screen.getByTestId("receipt-referral-copy")).toBeVisible();
  });

  it("renders nothing while the paused program or a failed fetch would lie", async () => {
    customerFixture = { id: "c-1" };
    payload = { paused: true };
    const { container } = renderRow();
    await vi.waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalled();
    });
    expect(container.querySelector('[data-testid="receipt-referral"]')).toBeNull();
  });
});
