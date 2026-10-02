import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/admin-api", () => ({
  apiGet: (...a: unknown[]) => api.get(...a),
  apiSend: (...a: unknown[]) => api.send(...a),
  apiErrorMessage: (e: unknown) => (e instanceof Error ? e.message : "error"),
}));

import { RiderLicenceCard } from "../rider-licence-card";

const lic = (kind: string, expiresOn: string | null, daysLeft: number | null) => ({
  ready: true,
  licence: { vehicle: "bike", expiresOn, status: { kind, daysLeft, blocked: kind === "expired" } },
});

beforeEach(() => {
  api.get.mockReset();
  api.send.mockReset();
});

describe("RiderLicenceCard", () => {
  it("shows an expired licence in red and lets staff record a renewed date", async () => {
    api.get.mockResolvedValue(lic("expired", "2026-09-01", -31));
    api.send.mockResolvedValue(lic("ok", "2028-01-01", 456));
    render(<RiderLicenceCard riderId="r1" />);
    const status = await screen.findByTestId("licence-status");
    expect(status).toHaveAttribute("data-kind", "expired");
    expect(status).toHaveTextContent("cannot go online");

    fireEvent.change(screen.getByLabelText(/expiry date/i), { target: { value: "2028-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByTestId("licence-status")).toHaveAttribute("data-kind", "ok"));
    expect(api.send).toHaveBeenCalledWith("/api/admin/riders/r1/licence", "PATCH", { expiresOn: "2028-01-01" });
  });

  it("asks staff to read the date from the photo when none is recorded; Save needs a change", async () => {
    api.get.mockResolvedValue(lic("unrecorded", null, null));
    render(<RiderLicenceCard riderId="r1" />);
    expect(await screen.findByTestId("licence-status")).toHaveTextContent("not recorded");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("has no editor for a bicycle, and explains the migration when tracking is off", async () => {
    api.get.mockResolvedValue({ ready: true, licence: { vehicle: "bicycle", expiresOn: null, status: { kind: "na", daysLeft: null, blocked: false } } });
    const { unmount } = render(<RiderLicenceCard riderId="r1" />);
    await screen.findByTestId("licence-status");
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    unmount();
    api.get.mockResolvedValue({ ready: false, licence: null });
    render(<RiderLicenceCard riderId="r1" />);
    expect(await screen.findByTestId("licence-card")).toHaveTextContent("202610020005");
  });

  it("surfaces a save failure", async () => {
    api.get.mockResolvedValue(lic("ok", "2028-01-01", 400));
    api.send.mockRejectedValue(new Error("Enter the expiry date from the licence"));
    render(<RiderLicenceCard riderId="r1" />);
    await screen.findByTestId("licence-status");
    fireEvent.change(screen.getByLabelText(/expiry date/i), { target: { value: "2029-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the expiry date");
  });
});
