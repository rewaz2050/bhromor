/**
 * The WhatsApp draft panel (2026-09-24) — the free half of the customer
 * notification layer, where a human does the last tap.
 *
 * Pinned here:
 *   • a draft shows the message that WOULD have been pushed, with the label
 *     the server built (so the panel never invents copy);
 *   • "Open in WhatsApp" opens the prefilled link and then records the OPEN —
 *     the panel must never imply WhatsApp delivered it;
 *   • "Not needed" is a dismissal, not a send;
 *   • nothing renders when there is nothing to send (both mounts stay out of
 *     the way), and a missing table names its migration instead of showing a
 *     cheerful empty queue.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("server-only", () => ({}));

const state = vi.hoisted(() => ({
  payload: {
    ready: true,
    migration: undefined as string | undefined,
    drafts: [] as Record<string, unknown>[],
  },
  sent: [] as { path: string; body: unknown }[],
  fail: false,
}));

vi.mock("@/lib/admin-api", () => ({
  apiGet: async (path: string) => {
    if (state.fail) throw new Error("Could not reach the server.");
    return JSON.parse(JSON.stringify({ ...state.payload, path }));
  },
  apiSend: async (path: string, _method: string, body: unknown) => {
    state.sent.push({ path, body });
    return { ok: true };
  },
  apiErrorMessage: (err: unknown) =>
    err instanceof Error ? err.message : "Something went wrong — please try again.",
}));

import WaDraftPanel from "../wa-draft-panel";

const draft = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  orderNo: "PS-20260924-0007",
  phone: "01712345678",
  kind: "confirmed",
  lang: "bn",
  message: "অর্ডার কনফার্ম হয়েছে ✅\nPS-20260924-0007 কনফার্ম —\n\nট্র্যাক করুন: https://x/track?id=PS-1",
  createdAt: "2026-09-24T10:00:00.000Z",
  label: "কনফার্ম",
  link: "https://wa.me/8801712345678?text=abc",
  ...over,
});

const openSpy = vi.fn();

beforeEach(() => {
  state.payload = { ready: true, migration: undefined, drafts: [draft()] };
  state.sent = [];
  state.fail = false;
  openSpy.mockReset();
  vi.stubGlobal("open", openSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WaDraftPanel — order mode", () => {
  it("shows the step label and the exact message, ready for one tap", async () => {
    render(<WaDraftPanel orderNo="PS-20260924-0007" status="confirmed" />);
    await waitFor(() => expect(screen.getByTestId("wa-draft")).toBeDefined());

    expect(screen.getByTestId("wa-draft-count").textContent).toBe("1");
    expect(screen.getByTestId("wa-draft").textContent).toContain("কনফার্ম");
    expect(screen.getByTestId("wa-draft").textContent).toContain("অর্ডার কনফার্ম হয়েছে");
    const link = screen.getByTestId("wa-draft-open") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toContain("wa.me/8801712345678");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("records the open after the tap, and says it was only an open", async () => {
    render(<WaDraftPanel orderNo="PS-20260924-0007" />);
    await waitFor(() => expect(screen.getByTestId("wa-draft-open")).toBeDefined());

    // The footnote never claims a delivery — the tap opens WhatsApp, nothing
    // more, and the row records exactly that.
    expect(document.body.textContent).toContain("never that WhatsApp delivered it");
    fireEvent.click(screen.getByTestId("wa-draft-open"));
    await waitFor(() =>
      expect(state.sent).toEqual([
        { path: "/api/admin/wa-outbox", body: { id: "d1", action: "opened" } },
      ]),
    );
    // The row is gone (optimistic) — and with nothing left to send, the whole
    // panel steps out of the way.
    await waitFor(() => expect(screen.queryByTestId("wa-draft")).toBeNull());
    expect(screen.queryByTestId("wa-draft-panel")).toBeNull();
  });

  it("lets staff dismiss a draft they will not send", async () => {
    render(<WaDraftPanel orderNo="PS-20260924-0007" />);
    await waitFor(() => expect(screen.getByTestId("wa-draft-dismiss")).toBeDefined());
    fireEvent.click(screen.getByTestId("wa-draft-dismiss"));
    await waitFor(() =>
      expect(state.sent).toEqual([
        { path: "/api/admin/wa-outbox", body: { id: "d1", action: "dismissed" } },
      ]),
    );
  });

  it("does not render a dead button when the number cannot chat", async () => {
    state.payload.drafts = [draft({ link: null })];
    render(<WaDraftPanel orderNo="PS-1" />);
    await waitFor(() => expect(screen.getByTestId("wa-draft-open")).toBeDefined());
    const link = screen.getByTestId("wa-draft-open") as HTMLAnchorElement;
    expect(link.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(link);
    // Nothing opened, nothing recorded — the row still waits.
    expect(state.sent).toEqual([]);
    expect(screen.getByTestId("wa-draft")).toBeDefined();
  });

  it("stays invisible when there is nothing to send", async () => {
    state.payload.drafts = [];
    const { container } = render(<WaDraftPanel orderNo="PS-1" />);
    await waitFor(() => expect(state.sent).toEqual([]));
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("names the migration when the table is missing", async () => {
    state.payload = {
      ready: false,
      migration: "supabase/migrations/202609240003_wa_outbox.sql",
      drafts: [],
    };
    render(<WaDraftPanel orderNo="PS-1" />);
    await waitFor(() => expect(screen.getByTestId("wa-draft-missing")).toBeDefined());
    expect(screen.getByTestId("wa-draft-missing").textContent).toContain(
      "202609240003_wa_outbox.sql",
    );
  });
});

describe("WaDraftPanel — queue mode (orders list)", () => {
  it("summarises what is waiting and links each order", async () => {
    render(<WaDraftPanel mode="queue" />);
    await waitFor(() => expect(screen.getByTestId("wa-draft-queue")).toBeDefined());
    expect(screen.getByTestId("wa-draft-count").textContent).toBe("1");
    const link = screen.getByRole("link", { name: "PS-20260924-0007" });
    expect(link.getAttribute("href")).toBe("/admin/orders/PS-20260924-0007");
  });

  it("stays out of the way when the queue is empty", async () => {
    state.payload.drafts = [];
    const { container } = render(<WaDraftPanel mode="queue" />);
    await new Promise((r) => setTimeout(r, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it("surfaces a read failure instead of pretending there is nothing", async () => {
    state.fail = true;
    render(<WaDraftPanel mode="queue" />);
    await waitFor(() => expect(screen.getByTestId("wa-draft-error")).toBeDefined());
  });
});
