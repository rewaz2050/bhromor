import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ path: "/rider", unread: 0 }));
vi.mock("@/lib/use-rider-inbox", () => ({ useRiderInbox: () => ({ unread: nav.unread }) }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));

import RiderBottomNav, { isTabActive } from "../rider-bottom-nav";

afterEach(cleanup);

describe("isTabActive", () => {
  it("home is exact; other tabs match their subtree", () => {
    expect(isTabActive("/rider", "/rider")).toBe(true);
    expect(isTabActive("/rider", "/rider/earnings")).toBe(false);
    expect(isTabActive("/rider/earnings", "/rider/earnings")).toBe(true);
    expect(isTabActive("/rider/earnings", "/rider/earnings/x")).toBe(true);
    expect(isTabActive("/rider/history", "/rider/historyx")).toBe(false);
  });
});

describe("<RiderBottomNav>", () => {
  it("links the five tabs", () => {
    nav.path = "/rider";
    render(<RiderBottomNav />);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/rider", "/rider/earnings", "/rider/history", "/rider/inbox", "/rider/profile"]);
  });

  it("marks only the current tab", () => {
    nav.path = "/rider/history";
    render(<RiderBottomNav />);
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute("href")).toBe("/rider/history");
  });

  it("shows an unread badge on the inbox tab only when there are unread messages", () => {
    nav.path = "/rider";
    nav.unread = 0;
    const { unmount } = render(<RiderBottomNav />);
    expect(screen.queryByTestId("inbox-badge")).toBeNull();
    unmount();
    nav.unread = 3;
    render(<RiderBottomNav />);
    expect(screen.getByTestId("inbox-badge")).toHaveTextContent("3");
    nav.unread = 0;
  });
});
