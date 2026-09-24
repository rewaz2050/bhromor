// @vitest-environment jsdom
/**
 * The shopper's opt-in card on /track (2026-09-24).
 *
 * Before this card the store had no customer channel at all: a shopper only
 * learned their parcel had moved by re-opening the tracker. The card must be
 * honest in every dead end that a real Sunamganj phone hits — WhatsApp's
 * in-app browser, a browser that already said "Block", a shop whose host has
 * no VAPID keys, and a finished order (where the offer is pointless).
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const state = vi.hoisted(() => ({
  supported: true,
  blocker: null as string | null,
  permission: "default" as NotificationPermission | "unsupported",
  subscribed: false,
  steps: [] as string[],
  configured: true,
  ready: true,
  enableCalls: 0,
  testCalls: 0,
  disableCalls: 0,
  enableResult: { ok: true } as { ok: boolean; message?: string },
}));

vi.mock("@/lib/use-order-push", () => ({
  useOrderPush: () => ({
    state: {
      supported: state.supported,
      blocker: state.blocker,
      permission: state.permission,
      subscribed: state.subscribed,
      steps: state.steps,
      configured: state.configured,
      ready: state.ready,
      loading: false,
    },
    enable: async () => {
      state.enableCalls += 1;
      if (state.enableResult.ok) state.subscribed = true;
      return state.enableResult;
    },
    disable: async () => {
      state.disableCalls += 1;
      state.subscribed = false;
    },
    sendTest: async () => {
      state.testCalls += 1;
      return state.enableResult.ok ? { ok: true } : state.enableResult;
    },
    refresh: async () => undefined,
  }),
}));

vi.mock("@/components/i18n/language-provider", () => ({
  useLanguage: () => ({
    lang: "bn",
    t: (key: string) =>
      ({
        "trackPush.title": "অর্ডারের খবর ফোনে নিন",
        "trackPush.subtitle": "এক ট্যাপেই এই ফোনে খবর আসবে।",
        "trackPush.enable": "ফোনে খবর চালু করুন",
        "trackPush.working": "কাজ হচ্ছে…",
        "trackPush.test": "টেস্ট পাঠান",
        "trackPush.disable": "বন্ধ করুন",
        "trackPush.on": "ফোনে খবর চালু আছে।",
        "trackPush.testSent": "টেস্ট পাঠানো হয়েছে।",
        "trackPush.off": "এই ফোনে খবর বন্ধ করা হলো।",
        "trackPush.failed": "চালু করা গেল না — আবার চেষ্টা করুন।",
        "trackPush.brBlocked": "এই ব্রাউজার আগেই ব্লক করে রেখেছে।",
        "trackPush.notReady": "ফোনে খবর এখনো চালু হয়নি।",
      })[key] ?? key,
  }),
}));

import NotifyOptIn from "../notify-opt-in";

/** The three facts the card needs (the tracker and the receipt both have them). */
const card = (over: { orderId?: string; phone?: string; status?: string } = {}) => (
  <NotifyOptIn
    orderId={over.orderId ?? "PS-20260924-0007"}
    phone={over.phone ?? "01712345678"}
    status={over.status ?? "confirmed"}
  />
);

const reset = () => {
  state.supported = true;
  state.blocker = null;
  state.permission = "default";
  state.subscribed = false;
  state.steps = [];
  state.configured = true;
  state.ready = true;
  state.enableCalls = 0;
  state.testCalls = 0;
  state.disableCalls = 0;
  state.enableResult = { ok: true };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  reset();
});

describe("NotifyOptIn (track page)", () => {
  it("offers every step it will send, then turns them on with one tap", async () => {
    reset();
    render(card());

    const milestones = screen.getByTestId("track-notify-milestones").textContent ?? "";
    // The journey, not just the four tracker milestones — packing and rider
    // assignment are announced too now (2026-09-24).
    expect(milestones).toContain("অর্ডার পেয়েছি");
    expect(milestones).toContain("কনফার্ম");
    expect(milestones).toContain("প্যাকিং");
    expect(milestones).toContain("রাইডার");
    expect(milestones).toContain("ডেলিভারি");

    fireEvent.click(screen.getByTestId("track-notify-enable"));
    await waitFor(() => expect(state.enableCalls).toBe(1));
    await waitFor(() => expect(screen.getByTestId("track-notify").dataset.state).toBe("on"));
    expect(screen.getByTestId("track-notify-note").textContent).toContain("চালু আছে");
    // Test + Off are the next actions, exactly like the staff card.
    expect(screen.getByTestId("track-notify-test")).toBeInTheDocument();
    expect(screen.queryByTestId("track-notify-enable")).not.toBeInTheDocument();
  });

  it("sends a real test push and reports it", async () => {
    reset();
    state.subscribed = true;
    render(card());
    fireEvent.click(screen.getByTestId("track-notify-test"));
    await waitFor(() => expect(state.testCalls).toBe(1));
    expect(screen.getByTestId("track-notify-note").textContent).toContain("টেস্ট পাঠানো হয়েছে");
  });

  it("tells a shopper inside WhatsApp's browser that push cannot work there", async () => {
    reset();
    state.supported = false;
    state.blocker =
      "Ei page ta WhatsApp er bhitore khulche. In-app browser e notification kono din asbe na — Chrome (ba Firefox) e kholun.";
    render(card());

    expect(screen.getByTestId("track-notify-blocker").textContent).toContain("WhatsApp");
    // No dead button: the only honest action is to leave for a real browser.
    expect(screen.getByTestId("track-notify-enable")).toBeDisabled();
  });

  it("shows the hand-set recovery steps when notifications were already blocked", async () => {
    reset();
    state.permission = "denied";
    state.steps = [
      "Address bar-er 🔒 (site settings) → Notifications → Allow.",
      "Phone Settings → Apps → Chrome → Notifications → ON.",
    ];
    render(card());

    const recovery = screen.getByTestId("track-notify-recovery").textContent ?? "";
    expect(recovery).toContain("ব্লক"); // the heading says what happened
    expect(recovery).toContain("site settings");
    expect(recovery).toContain("Chrome");
  });

  it("waits for the shop's setup instead of failing on the tap", async () => {
    reset();
    state.ready = false;
    render(card());
    expect(screen.getByTestId("track-notify-notready")).toBeInTheDocument();
    expect(screen.getByTestId("track-notify-enable")).toBeDisabled();

    cleanup();
    reset();
    state.configured = false;
    render(card());
    expect(screen.getByTestId("track-notify-enable")).toBeDisabled();
  });

  it("surfaces a refusal instead of pretending it worked", async () => {
    reset();
    state.enableResult = { ok: false, message: "Browser block kore diyeche — nicher steps follow korun." };
    render(card());
    fireEvent.click(screen.getByTestId("track-notify-enable"));
    await waitFor(() =>
      expect(screen.getByTestId("track-notify-error").textContent).toContain("block"),
    );
    expect(screen.getByTestId("track-notify").dataset.state).toBe("off");
  });

  it("renders nothing once the order is delivered or cancelled", () => {
    reset();
    const { container } = render(card({ status: "delivered" }));
    expect(container).toBeEmptyDOMElement();
    cleanup();
    const { container: c2 } = render(card({ status: "cancelled" }));
    expect(c2).toBeEmptyDOMElement();
  });

  it("renders on the receipt, where there is no order status to check yet", () => {
    reset();
    // The receipt passes no status — a freshly placed order is always live,
    // and this is the one moment the shopper is certainly looking.
    const { container } = render(
      <NotifyOptIn orderId="PS-20260924-0007" phone="01712345678" />,
    );
    expect(container).not.toBeEmptyDOMElement();
    expect(screen.getByTestId("track-notify-enable")).toBeInTheDocument();
  });
});
