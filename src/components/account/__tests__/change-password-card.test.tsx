/**
 * Self-service password change (apply = sign up, 2026-09-26): the only way
 * an owner replaces a staff-issued temporary password — no e-mail reset.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  updateUser: vi.fn(async () => ({ error: null as null | { message: string } })),
  client: true,
}));
vi.mock("@/lib/supabase-browser", () => ({
  getSupabaseBrowser: () => (auth.client ? { auth: { updateUser: auth.updateUser } } : null),
}));

import ChangePasswordCard from "../change-password-card";

const fill = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

beforeEach(() => {
  auth.updateUser.mockClear();
  auth.updateUser.mockResolvedValue({ error: null });
  auth.client = true;
});

describe("ChangePasswordCard", () => {
  it("refuses a mismatched pair before calling Auth", async () => {
    render(<ChangePasswordCard />);
    fill(screen.getByLabelText(/নতুন পাসওয়ার্ড/), "secret1");
    fill(screen.getByLabelText(/আবার লিখুন/), "secret2");
    fireEvent.click(screen.getByRole("button", { name: "পাসওয়ার্ড বদলান" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/মিলছে না/);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("updates the session user's password and clears the fields", async () => {
    render(<ChangePasswordCard />);
    fill(screen.getByLabelText(/নতুন পাসওয়ার্ড/), "secret1");
    fill(screen.getByLabelText(/আবার লিখুন/), "secret1");
    fireEvent.click(screen.getByRole("button", { name: "পাসওয়ার্ড বদলান" }));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: "secret1" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/বদলে গেছে/);
    expect(screen.getByLabelText(/নতুন পাসওয়ার্ড/)).toHaveValue("");
  });

  it("explains an Auth refusal in Bangla", async () => {
    auth.updateUser.mockResolvedValueOnce({ error: { message: "New password should be different from the old password." } });
    render(<ChangePasswordCard />);
    fill(screen.getByLabelText(/নতুন পাসওয়ার্ড/), "secret1");
    fill(screen.getByLabelText(/আবার লিখুন/), "secret1");
    fireEvent.click(screen.getByRole("button", { name: "পাসওয়ার্ড বদলান" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/আলাদা/);
  });

  it("has a show/hide toggle and tells the user where a forgotten password goes", () => {
    render(<ChangePasswordCard />);
    const toggle = screen.getByRole("button", { name: "পাসওয়ার্ড দেখুন" });
    fireEvent.click(toggle);
    expect(screen.getByLabelText(/নতুন পাসওয়ার্ড/)).toHaveAttribute("type", "text");
    expect(screen.getByText(/সাপোর্টে/)).toBeInTheDocument();
  });
});
