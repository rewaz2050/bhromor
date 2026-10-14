import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import CustomerPasswordCard from "../customer-password-card";

/**
 * Security 2026-10-14 M6: customers can rotate their own password from the
 * account page. Identity comes from the session cookie; the API answers with
 * policy errors (weak/deny-listed password, wrong current password).
 */

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const fill = (label: string, value: string) => {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
};

const submit = () => {
  fireEvent.click(screen.getByRole("button", { name: "পাসওয়ার্ড বদলান" }));
};

describe("customer password card", () => {
  it("posts current + next and reports success", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<CustomerPasswordCard />);
    fill("বর্তমান পাসওয়ার্ড", "old-secret-1");
    fill("নতুন পাসওয়ার্ড", "brand-new-pass-2");
    fill("নতুন পাসওয়ার্ড আবার", "brand-new-pass-2");
    submit();
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy());
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      current: "old-secret-1",
      next: "brand-new-pass-2",
    });
    // Inputs clear after success.
    expect((screen.getByLabelText("বর্তমান পাসওয়ার্ড", { exact: true }) as HTMLInputElement).value).toBe("");
  });

  it("blocks mismatched confirmation before any request", async () => {
    render(<CustomerPasswordCard />);
    fill("বর্তমান পাসওয়ার্ড", "old-secret-1");
    fill("নতুন পাসওয়ার্ড", "brand-new-pass-2");
    fill("নতুন পাসওয়ার্ড আবার", "different-pass-3");
    submit();
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces the server's policy message (M6) on 422", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: "নতুন পাসওয়ার্ড খুব সহজ — আরও জটিল করুন।" }),
    });
    render(<CustomerPasswordCard />);
    fill("বর্তমান পাসওয়ার্ড", "old-secret-1");
    fill("নতুন পাসওয়ার্ড", "12345678");
    fill("নতুন পাসওয়ার্ড আবার", "12345678");
    submit();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("খুব সহজ"),
    );
  });
});
