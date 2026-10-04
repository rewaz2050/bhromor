import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { InboxItem } from "@/lib/rider-inbox";

const state = vi.hoisted(() => ({ hook: {} as Record<string, unknown> }));
vi.mock("@/lib/use-rider", () => ({ useRiderSession: () => ({ status: "authed", rider: { id: "r1" } }) }));
vi.mock("@/lib/use-rider-inbox", () => ({ useRiderInbox: () => state.hook }));

import RiderInboxPage from "../inbox/page";

const msg = (over: Partial<InboxItem> = {}): InboxItem => ({
  id: "m1", title: "আজ রাস্তা বন্ধ", body: "জিন্দাবাজার এড়িয়ে চলুন", severity: "info", personal: false, at: Date.parse("2026-10-02T04:00:00Z"), unread: true, ...over,
});

const base = (over: Record<string, unknown> = {}) => ({
  items: [], unread: 0, ready: true, loading: false, refresh: vi.fn(), markRead: vi.fn(async () => {}), ...over,
});

afterEach(cleanup);

describe("<RiderInboxPage>", () => {
  it("shows messages with unread markers and marks the inbox read once", () => {
    const markRead = vi.fn(async () => {});
    state.hook = base({ items: [msg(), msg({ id: "m2", title: "পুরনো", unread: false })], unread: 1, markRead });
    const { rerender } = render(<RiderInboxPage />);
    const items = screen.getAllByTestId("inbox-item");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveAttribute("data-unread", "true");
    expect(items[1]).toHaveAttribute("data-unread", "false");
    expect(items[0].textContent).toContain("জিন্দাবাজার এড়িয়ে চলুন");
    expect(markRead).toHaveBeenCalledTimes(1);
    rerender(<RiderInboxPage />);
    expect(markRead).toHaveBeenCalledTimes(1);
  });

  it("flags important and personal messages", () => {
    state.hook = base({ items: [msg({ severity: "important", personal: true })], unread: 0 });
    render(<RiderInboxPage />);
    expect(screen.getByTestId("inbox-item")).toHaveAttribute("data-severity", "important");
    expect(screen.getByText("আপনার জন্য")).toBeTruthy();
  });

  it("says so when empty or not yet enabled, and does not mark read while loading", () => {
    const markRead = vi.fn(async () => {});
    state.hook = base({ loading: true, unread: 3, markRead });
    const { unmount } = render(<RiderInboxPage />);
    expect(markRead).not.toHaveBeenCalled();
    unmount();
    state.hook = base();
    const second = render(<RiderInboxPage />);
    expect(screen.getByTestId("inbox-empty")).toBeTruthy();
    second.unmount();
    state.hook = base({ ready: false });
    render(<RiderInboxPage />);
    expect(screen.getByTestId("inbox-unavailable")).toBeTruthy();
  });
});
