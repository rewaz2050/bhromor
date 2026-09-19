/**
 * Toasts (Batch N) — one tiny, app-wide notice channel.
 *
 * Why a store instead of per-component state: almost everything worth telling
 * the shopper happens *inside* a component that is about to unmount or lose
 * focus — the quick-add sheet closes, the wishlist heart is tapped on a rail,
 * a size suggestion is applied. A store lets any of them say one sentence
 * ("Added to bag · Size L · ৳1,490") and lets a single surface in the layout
 * render it, so the message survives the component that produced it.
 *
 * Rules of the house (they are why this file exists at all):
 *   · one message at a time, newest wins — no stacks, no queues;
 *   · it never blocks a tap (pointer-events: none);
 *   · it is announced (role="status"), so screen readers hear it too;
 *   · money and quantities come from the caller as formatted strings — the
 *     store holds no opinions about prices.
 */

export type ToastTone = "success" | "info" | "warn";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
  /** Optional single action, e.g. "View bag". */
  action?: { label: string; href: string };
  /** Milliseconds on screen; 0 = until replaced. */
  duration: number;
}

export const TOAST_DEFAULT_MS = 2600;

type Listener = () => void;

let current: Toast | null = null;
let nextId = 1;
let hideTimer: number | null = null;
const listeners = new Set<Listener>();

const notify = () => {
  for (const listener of listeners) listener();
};

export const subscribeToast = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getToast = (): Toast | null => current;

/** Stable empty snapshot for non-browser rendering. */
export const getToastServer = (): Toast | null => null;

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: { label: string; href: string };
  duration?: number;
}

export const showToast = (input: ToastInput): number => {
  const id = nextId++;
  current = {
    id,
    message: input.message,
    tone: input.tone ?? "success",
    action: input.action,
    duration: input.duration ?? TOAST_DEFAULT_MS,
  };
  if (hideTimer !== null) window.clearTimeout(hideTimer);
  if (current.duration > 0) {
    hideTimer = window.setTimeout(() => {
      // Late dismiss of an old toast must never clear a newer one.
      if (current?.id === id) dismissToast(id);
    }, current.duration);
  } else {
    hideTimer = null;
  }
  notify();
  return id;
};

export const dismissToast = (id?: number): void => {
  if (!current) return;
  if (id !== undefined && current.id !== id) return;
  if (hideTimer !== null) {
    window.clearTimeout(hideTimer);
    hideTimer = null;
  }
  current = null;
  notify();
};

/** Test-only reset so suites cannot leak a toast into the next render. */
export const __resetToast = (): void => {
  if (hideTimer !== null && typeof window !== "undefined") {
    window.clearTimeout(hideTimer);
  }
  hideTimer = null;
  current = null;
  notify();
};
