/**
 * Admin card login box (apply = sign up, 2026-09-26): approval WhatsApp
 * hand-off, staff password reset shown once, legacy link form.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicantLoginBox } from "../applicant-login-box";

const base = {
  kind: "vendor" as const,
  name: "Arian Fashion",
  phone: "01712345678",
  email: "shop@example.com",
  live: true,
  onLink: vi.fn(async () => true),
  onResetPassword: vi.fn(async () => "abc-def-ghk"),
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ApplicantLoginBox", () => {
  it("offers the approval WhatsApp message only once the row is active", () => {
    const { rerender } = render(<ApplicantLoginBox {...base} status="pending" linked />);
    expect(screen.queryByRole("link", { name: /WhatsApp: approved/ })).not.toBeInTheDocument();
    expect(screen.getByText(/moment the row is approved/)).toBeInTheDocument();

    rerender(<ApplicantLoginBox {...base} status="active" linked />);
    const wa = screen.getByRole("link", { name: /WhatsApp: approved/ });
    expect(wa).toHaveAttribute("href", expect.stringMatching(/^https:\/\/wa\.me\/8801712345678\?text=/));
    expect(decodeURIComponent(wa.getAttribute("href") ?? "")).toContain("/vendor/login");
  });

  it("resets the password after confirmation and shows it once, never inside the chat link", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ApplicantLoginBox {...base} status="active" linked />);
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    await waitFor(() => expect(base.onResetPassword).toHaveBeenCalledTimes(1));
    const box = await screen.findByRole("status");
    expect(box).toHaveTextContent("abc-def-ghk");
    const chat = screen.getByRole("link", { name: "Open WhatsApp chat" });
    expect(decodeURIComponent(chat.getAttribute("href") ?? "")).not.toContain("abc-def-ghk");
  });

  it("does nothing when the admin cancels the confirm", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const onResetPassword = vi.fn(async () => "zzz-zzz-zzz");
    render(<ApplicantLoginBox {...base} onResetPassword={onResetPassword} status="active" linked />);
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));
    expect(onResetPassword).not.toHaveBeenCalled();
  });

  it("keeps the manual link form for rows without a login", async () => {
    const onLink = vi.fn(async () => true);
    render(<ApplicantLoginBox {...base} kind="rider" onLink={onLink} status="pending" linked={false} />);
    const input = screen.getByLabelText("Rider account email");
    fireEvent.change(input, { target: { value: "rider@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Link rider" }));
    await waitFor(() => expect(onLink).toHaveBeenCalledWith("rider@example.com"));
    expect(await screen.findByRole("button", { name: "Reset password" })).toBeInTheDocument();
  });
});
