import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AccountView from "../account-view";
import { LanguageProvider } from "@/components/i18n/language-provider";
vi.mock("@/lib/use-customer", () => ({ useCustomer: () => ({ customer: null, checked: true, refresh: vi.fn(), signOut: vi.fn() }) }));
beforeEach(() => {
  localStorage.clear();
  document.cookie = "prosanti-lang=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "Sign-in unavailable" }, { status: 503 })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("Customer account access", () => {
  it("has English labels, signup policy guidance and a form before the benefits", () => {
    const { container } = render(<AccountView initialCustomer={null} />);
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    const password = screen.getByLabelText("Password");
    expect(password).toHaveAttribute("minlength", "8");
    expect(password).toHaveAccessibleDescription(/at least 8 characters/);
    const form = container.querySelector("form")!;
    expect(form.compareDocumentPosition(screen.getByTestId("account-pitch")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("uses roving tabs and arrow keys without imposing signup rules on login", () => {
    render(<AccountView initialCustomer={null} />);
    const signup = screen.getByRole("tab", { name: "New account" });
    const login = screen.getByRole("tab", { name: "Sign in" });
    expect(signup).toHaveAttribute("tabindex", "0");
    expect(login).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(signup, { key: "ArrowRight" });
    expect(login).toHaveFocus();
    expect(login).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Sign in");
    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "6");
    fireEvent.keyDown(login, { key: "Home" });
    expect(signup).toHaveFocus();
    expect(screen.getByLabelText("Password")).toHaveAttribute("minlength", "8");
  });
  it("retains failed-login inputs and focuses the error", async () => {
    const { container } = render(<AccountView initialCustomer={null} />);
    fireEvent.click(screen.getByRole("tab", { name: "Sign in" }));
    fireEvent.change(screen.getByLabelText("Mobile number"), { target: { value: "01712345678" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "qa-password" } });
    fireEvent.submit(container.querySelector("form")!);
    const error = await screen.findByRole("alert");
    await waitFor(() => expect(error).toHaveFocus());
    expect(screen.getByLabelText("Mobile number")).toHaveValue("01712345678");
    expect(screen.getByLabelText("Password")).toHaveValue("qa-password");
  });
  it("offers Bengali password controls and support even without a configured WhatsApp", () => {
    render(<LanguageProvider initialLang="bn"><AccountView initialCustomer={null} /></LanguageProvider>);
    fireEvent.click(screen.getByRole("tab", { name: "লগ ইন" }));
    const password = screen.getByLabelText("পাসওয়ার্ড");
    fireEvent.click(screen.getByRole("button", { name: "দেখুন" }));
    expect(password).toHaveAttribute("type", "text");
    expect(screen.getByRole("link", { name: "সাপোর্টে যোগাযোগ করুন" })).toHaveAttribute("href", "/contact");
  });
});
