/**
 * The shop application follows the storefront language: English by default.
 * The Bangla path is covered by shop-apply.test.tsx.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import ShopApplyPage from "../page";

vi.mock("@/lib/use-live-zones", () => ({
  useLiveZones: () => ({
    activeZones: [{ id: "z1", name: "Kandirpar", active: true }],
    zones: [{ id: "z1", name: "Kandirpar", active: true }],
    loading: false,
  }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Shop Apply Page — English", () => {
  it("renders English headings, steps and the submit button", () => {
    render(<ShopApplyPage />);

    expect(screen.getByRole("heading", { name: "Join as a shop owner" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit application and create account" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Application steps" })).toBeInTheDocument();
    expect(screen.getByLabelText("Agree to the terms")).toBeInTheDocument();
  });

  it("shows the English password-mismatch error before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<ShopApplyPage />);

    fireEvent.change(screen.getByPlaceholderText("e.g. Arian Fashion / Oitijjho Clothing"), { target: { value: "Arian Fashion" } });
    fireEvent.change(screen.getByPlaceholderText("017XXXXXXXX"), { target: { value: "01712345678" } });
    fireEvent.change(screen.getByLabelText(/Login password/), { target: { value: "secret1" } });
    fireEvent.change(screen.getByLabelText(/Type the password again/), { target: { value: "secret2" } });
    fireEvent.change(screen.getByPlaceholderText(/Full shop address|e\.g\. Kandirpar/), { target: { value: "Kandirpar" } });
    fireEvent.click(screen.getByRole("button", { name: /Kandirpar/ }));
    fireEvent.click(screen.getByLabelText("Agree to the terms"));
    fireEvent.click(screen.getByRole("button", { name: "Submit application and create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The two passwords don't match");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
