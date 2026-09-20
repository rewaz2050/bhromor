import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import InstallPrompt from "@/components/layout/install-prompt";
import { INSTALL_KEY, VISITS_KEY } from "@/lib/install-prompt";

const fireInstallable = () => {
  const ev = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  };
  ev.prompt = vi.fn().mockResolvedValue(undefined);
  ev.userChoice = Promise.resolve({ outcome: "accepted" as const });
  act(() => {
    window.dispatchEvent(ev);
  });
  return ev;
};

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("InstallPrompt", () => {
  it("stays silent on a first visit even when the browser offers install", () => {
    render(<InstallPrompt />);
    fireInstallable();
    expect(screen.queryByTestId("install-prompt")).toBeNull();
    // …but the visit was counted for next time.
    expect(JSON.parse(localStorage.getItem(VISITS_KEY) ?? "{}").count).toBe(1);
  });

  it("offers the native install sheet from the second visit and remembers 'not now'", async () => {
    localStorage.setItem(VISITS_KEY, JSON.stringify({ count: 1, lastDay: "2000-01-01" }));
    render(<InstallPrompt />);
    const ev = fireInstallable();
    const card = await screen.findByTestId("install-prompt");
    expect(card).toHaveAttribute("data-mode", "native");
    fireEvent.click(screen.getByTestId("install-accept"));
    await act(async () => {
      await Promise.resolve();
    });
    expect(ev.prompt).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(INSTALL_KEY) ?? "{}").installed).toBe(true);

    cleanup();
    localStorage.setItem(INSTALL_KEY, JSON.stringify({ dismissedAt: 0, installed: false }));
    render(<InstallPrompt />);
    fireInstallable();
    fireEvent.click(await screen.findByTestId("install-dismiss"));
    expect(screen.queryByTestId("install-prompt")).toBeNull();
    expect(JSON.parse(localStorage.getItem(INSTALL_KEY) ?? "{}").dismissedAt).toBeGreaterThan(0);
  });
});
