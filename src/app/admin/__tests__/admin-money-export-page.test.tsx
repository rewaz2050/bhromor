import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ download: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/admin-api", () => ({
  apiDownload: (...a: unknown[]) => m.download(...a),
  apiErrorMessage: (e: unknown) => (e instanceof Error ? e.message : "error"),
}));
vi.mock("@/lib/csv", () => ({ downloadText: (...a: unknown[]) => m.save(...a) }));

import MoneyExportPage from "../money/export/page";

beforeEach(() => {
  m.download.mockReset().mockResolvedValue({ text: "csv", filename: "prosanti-audit.csv", rows: 3, truncated: false });
  m.save.mockReset();
});

describe("/admin/money/export", () => {
  it("fetches the chosen ledger + period and saves the file", async () => {
    render(<MoneyExportPage />);
    fireEvent.change(screen.getByLabelText("Ledger"), { target: { value: "shop_ledger" } });
    fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    await waitFor(() => expect(m.save).toHaveBeenCalledWith("prosanti-audit.csv", "csv"));
    expect(m.download).toHaveBeenCalledWith("/api/admin/money/export?kind=shop_ledger&from=2026-09-01&to=2026-09-30");
    expect(screen.getByRole("status")).toHaveTextContent("3 rows saved");
  });

  it("opens on the ledger named in the link (the audit trail page's CSV button)", async () => {
    window.history.replaceState(null, "", "/admin/money/export?kind=audit");
    render(<MoneyExportPage />);
    await waitFor(() => expect((screen.getByLabelText("Ledger") as HTMLSelectElement).value).toBe("audit"));
    window.history.replaceState(null, "", "/admin/money/export?kind=nonsense");
    render(<MoneyExportPage />);
    expect((screen.getAllByLabelText("Ledger")[1] as HTMLSelectElement).value).toBe("rider_wallet");
    window.history.replaceState(null, "", "/");
  });

  it("warns when the file was cut at the row cap", async () => {
    m.download.mockResolvedValue({ text: "csv", filename: "f.csv", rows: 20000, truncated: true });
    render(<MoneyExportPage />);
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(await screen.findByRole("status")).toHaveTextContent("first 20000 rows only");
  });

  it("shows the server's refusal and saves nothing", async () => {
    m.download.mockRejectedValue(new Error("Pick at most 366 days per export."));
    render(<MoneyExportPage />);
    fireEvent.click(screen.getByRole("button", { name: "Download CSV" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("at most 366 days");
    expect(m.save).not.toHaveBeenCalled();
  });
});
