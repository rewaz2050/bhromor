import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({ hook: {} as Record<string, unknown> }));
vi.mock("@/lib/use-rider-announcements", () => ({ useRiderAnnouncements: () => state.hook }));

import RiderAnnouncementsPage from "../riders/announcements/page";

const base = (over: Record<string, unknown> = {}) => ({
  live: true, checked: true, items: [], riders: [{ id: "11111111-1111-1111-1111-111111111111", name: "Rafiq" }], ready: true,
  loading: false, error: null, refresh: vi.fn(), post: vi.fn(async () => true), remove: vi.fn(async () => true), ...over,
});

afterEach(cleanup);

describe("<RiderAnnouncementsPage>", () => {
  it("posts to everyone by default, then clears the form", async () => {
    const post = vi.fn(async () => true);
    state.hook = base({ post });
    render(<RiderAnnouncementsPage />);
    fireEvent.change(screen.getByLabelText(/শিরোনাম/), { target: { value: "  Settle by 8pm " } });
    fireEvent.change(screen.getByLabelText("Severity"), { target: { value: "important" } });
    fireEvent.change(screen.getByLabelText("Expiry"), { target: { value: "24" } });
    fireEvent.click(screen.getByRole("button", { name: "পাঠান" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith({ title: "Settle by 8pm", body: "", severity: "important", riderId: null, expiresHours: 24 }));
    expect(await screen.findByRole("status")).toHaveTextContent("পাঠানো হয়েছে");
    expect((screen.getByLabelText(/শিরোনাম/) as HTMLInputElement).value).toBe("");
  });

  it("can address one rider", async () => {
    const post = vi.fn(async () => true);
    state.hook = base({ post });
    render(<RiderAnnouncementsPage />);
    fireEvent.change(screen.getByLabelText(/শিরোনাম/), { target: { value: "Blurry KYC" } });
    fireEvent.change(screen.getByLabelText("Recipient"), { target: { value: "11111111-1111-1111-1111-111111111111" } });
    fireEvent.click(screen.getByRole("button", { name: "পাঠান" }));
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.objectContaining({ riderId: "11111111-1111-1111-1111-111111111111" })));
  });

  it("send is disabled without a title; a failed post keeps the text", async () => {
    state.hook = base({ post: vi.fn(async () => false) });
    render(<RiderAnnouncementsPage />);
    expect(screen.getByRole("button", { name: "পাঠান" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/শিরোনাম/), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "পাঠান" }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect((screen.getByLabelText(/শিরোনাম/) as HTMLInputElement).value).toBe("x");
  });

  it("lists sent messages with the recipient and deletes after confirmation", () => {
    const remove = vi.fn(async () => true);
    state.hook = base({
      remove,
      items: [
        { id: "a1", title: "Road closed", body: "Zindabazar", severity: "important", riderId: null, riderName: null, at: Date.parse("2026-10-02T04:00:00Z"), expiresAt: null },
        { id: "a2", title: "KYC", body: "", severity: "info", riderId: "r1", riderName: "Rafiq", at: Date.parse("2026-10-02T05:00:00Z"), expiresAt: null },
      ],
    });
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    render(<RiderAnnouncementsPage />);
    const rows = screen.getAllByTestId("announcement-row");
    expect(rows[0].textContent).toContain("সব রাইডার");
    expect(rows[1].textContent).toContain("Rafiq");
    const del = screen.getAllByRole("button", { name: "মুছুন" });
    fireEvent.click(del[0]);
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(del[0]);
    expect(remove).toHaveBeenCalledWith("a1");
  });

  it("tells staff to run the migration when the tables are missing", () => {
    state.hook = base({ ready: false });
    render(<RiderAnnouncementsPage />);
    expect(screen.getByTestId("announcements-missing").textContent).toContain("202610020001_rider_inbox.sql");
    expect(screen.queryByTestId("announcement-form")).toBeNull();
  });
});
