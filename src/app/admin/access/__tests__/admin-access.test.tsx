/**
 * Admin → Access requests (2026-09-26): the phone-check gate before
 * approving, the reject-with-note path, and the not-migrated notice.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pending: [] as unknown[],
  recent: [] as unknown[],
  ready: true,
  live: true,
  loading: false,
  decide: vi.fn(async (id: string, action: string, note?: string) => ({
    id,
    kind: "vendor",
    subjectId: "s1",
    subjectName: "Arian Fashion",
    email: "shop@example.com",
    phone: "01712345678",
    status: action === "approve" ? "approved" : "rejected",
    note: note ?? null,
    requestedAt: "2026-09-26T09:00:00Z",
    reviewedAt: "2026-09-26T10:00:00Z",
    expiresAt: "2026-09-27T10:00:00Z",
    usedAt: null,
  })),
}));

vi.mock("@/lib/use-access-requests", () => ({
  useAccessRequests: () => ({
    pending: state.pending,
    recent: state.recent,
    ready: state.ready,
    live: state.live,
    loading: state.loading,
    error: null,
    clearError: vi.fn(),
    decide: state.decide,
    reset: vi.fn(),
  }),
}));
vi.mock("@/lib/use-now", () => ({ useNow: () => Date.parse("2026-09-26T10:00:00Z") }));

import AdminAccessPage from "../page";

const req = {
  id: "req-1",
  kind: "vendor" as const,
  subjectId: "s1",
  subjectName: "Arian Fashion",
  email: "shop@example.com",
  phone: "01712345678",
  status: "pending" as const,
  note: null,
  requestedAt: "2026-09-26T09:30:00Z",
  reviewedAt: null,
  expiresAt: null,
  usedAt: null,
};

beforeEach(() => {
  state.pending = [req];
  state.recent = [];
  state.ready = true;
  state.live = true;
  state.loading = false;
  state.decide.mockClear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminAccessPage", () => {
  it("keeps Approve disabled until the phone check is ticked, then approves and offers WhatsApp", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminAccessPage />);
    expect(screen.getByRole("link", { name: /Call/ })).toHaveAttribute("href", "tel:01712345678");
    const approve = screen.getByRole("button", { name: /Approve — open 24 h window/ });
    expect(approve).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /they confirmed the request/ }));
    expect(approve).toBeEnabled();
    fireEvent.click(approve);
    await waitFor(() => expect(state.decide).toHaveBeenCalledWith("req-1", "approve"));
    const done = await screen.findByRole("status");
    expect(done).toHaveTextContent(/Approved — Arian Fashion/);
    const wa = screen.getByRole("link", { name: /WhatsApp them/ });
    expect(wa).toHaveAttribute("href", expect.stringMatching(/^https:\/\/wa\.me\/8801712345678\?text=/));
    expect(decodeURIComponent(wa.getAttribute("href") ?? "")).toContain("/vendor/login");
  });

  it("rejects with the prompted note", async () => {
    vi.spyOn(window, "prompt").mockReturnValue("ফোনে মেলেনি");
    render(<AdminAccessPage />);
    fireEvent.click(screen.getByRole("button", { name: "Reject with note" }));
    await waitFor(() => expect(state.decide).toHaveBeenCalledWith("req-1", "reject", "ফোনে মেলেনি"));
    expect(await screen.findByRole("status")).toHaveTextContent(/Rejected — Arian Fashion/);
  });

  it("explains the missing migration instead of an empty page", () => {
    state.pending = [];
    state.ready = false;
    render(<AdminAccessPage />);
    expect(screen.getByText(/202609260001_password_reset_requests\.sql/)).toBeInTheDocument();
  });

  it("lists recent decisions with their derived status", () => {
    state.pending = [];
    state.recent = [{ ...req, id: "r2", status: "expired" as const, requestedAt: "2026-09-25T09:00:00Z" }];
    render(<AdminAccessPage />);
    expect(screen.getByText("No reset requests waiting.")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });
});
