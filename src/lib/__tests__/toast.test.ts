import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetToast,
  dismissToast,
  getToast,
  showToast,
  subscribeToast,
} from "@/lib/toast";

beforeEach(() => {
  vi.useFakeTimers();
  __resetToast();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("toast store", () => {
  it("holds one message at a time — the newest wins", () => {
    showToast({ message: "Added to bag" });
    const id = showToast({ message: "Added to wishlist" });
    expect(getToast()?.message).toBe("Added to wishlist");
    expect(getToast()?.id).toBe(id);
  });

  it("tells every subscriber, once per change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToast(listener);
    showToast({ message: "Saved" });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    showToast({ message: "Saved again" });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("clears itself after its own duration", () => {
    showToast({ message: "Link copied", duration: 2000 });
    vi.advanceTimersByTime(1999);
    expect(getToast()).not.toBeNull();
    vi.advanceTimersByTime(2);
    expect(getToast()).toBeNull();
  });

  it("a late timer never dismisses a newer message", () => {
    showToast({ message: "First", duration: 1000 });
    vi.advanceTimersByTime(900);
    showToast({ message: "Second", duration: 1000 });
    vi.advanceTimersByTime(200); // the first toast's timer fires here
    expect(getToast()?.message).toBe("Second");
  });

  it("ignores a dismiss aimed at a toast that has already been replaced", () => {
    showToast({ message: "First" });
    const second = showToast({ message: "Second" });
    dismissToast(second - 1);
    expect(getToast()?.message).toBe("Second");
    dismissToast(second);
    expect(getToast()).toBeNull();
  });

  it("stays put when the duration is zero (until replaced)", () => {
    showToast({ message: "Stay", duration: 0 });
    vi.advanceTimersByTime(120_000);
    expect(getToast()?.message).toBe("Stay");
  });

  it("keeps the tone and the optional action", () => {
    showToast({
      message: "Could not copy",
      tone: "warn",
      action: { label: "View bag", href: "/cart" },
    });
    expect(getToast()).toMatchObject({
      tone: "warn",
      action: { label: "View bag", href: "/cart" },
    });
  });
});
