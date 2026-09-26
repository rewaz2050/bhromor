/** UX plan §8 (R6) — a referral link lands with a banner, not silently. */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import RefCapture, { REF_BANNER_DISMISSED_KEY } from "@/components/promo/ref-capture";
import { LanguageProvider } from "@/components/i18n/language-provider";
import { REFERRAL_STORAGE_KEY, referralCodeFor } from "@/lib/referral";

const code = referralCodeFor("01711111111");

const mount = () =>
  render(
    <LanguageProvider initialLang="bn">
      <RefCapture />
    </LanguageProvider>,
  );

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  window.history.replaceState(null, "", "/");
});
afterEach(cleanup);

describe("<RefCapture>", () => {
  it("renders nothing on an ordinary visit", async () => {
    mount();
    await Promise.resolve();
    expect(screen.queryByTestId("ref-landing")).not.toBeInTheDocument();
    expect(localStorage.getItem(REFERRAL_STORAGE_KEY)).toBeNull();
  });

  it("stores ?ref= and tells the friend what they just got, in Bengali digits", async () => {
    window.history.replaceState(null, "", `/shop?ref=${code}`);
    mount();
    const banner = await screen.findByTestId("ref-landing");
    const title = banner.querySelector("strong")!;
    expect(title).toHaveTextContent("আপনার বন্ধু আপনাকে প্রথম অর্ডারে ৳৫০ ছাড় দিল");
    expect(title.textContent).not.toMatch(/\d/);
    expect(banner).toHaveTextContent(`PS-${code}`);
    expect(screen.getByRole("link", { name: "কেনাকাটা শুরু করুন" })).toHaveAttribute("href", "/shop");
    expect(JSON.parse(localStorage.getItem(REFERRAL_STORAGE_KEY)!).code).toBe(code);
    fireEvent.click(screen.getByRole("button", { name: "বন্ধ করুন" }));
    expect(screen.queryByTestId("ref-landing")).not.toBeInTheDocument();
    expect(sessionStorage.getItem(REF_BANNER_DISMISSED_KEY)).toBe(code);
    // The code stays for checkout even though the banner is gone.
    expect(JSON.parse(localStorage.getItem(REFERRAL_STORAGE_KEY)!).code).toBe(code);
  });

  it("stays dismissed for the session but still shows for a different code", async () => {
    sessionStorage.setItem(REF_BANNER_DISMISSED_KEY, code);
    window.history.replaceState(null, "", `/?ref=${code}`);
    mount();
    await Promise.resolve();
    expect(screen.queryByTestId("ref-landing")).not.toBeInTheDocument();
    cleanup();
    const other = referralCodeFor("01722222222");
    window.history.replaceState(null, "", `/?ref=${other}`);
    mount();
    expect(await screen.findByTestId("ref-landing")).toBeInTheDocument();
  });
});
