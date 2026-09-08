"use client";

/**
 * Accessible slide-over drawer.
 *
 * Why a portal: the sticky site header uses `backdrop-blur`, and any element
 * with a backdrop-filter becomes the *containing block* for its
 * position:fixed descendants. A drawer rendered inside the header was
 * therefore clipped to the 64px header strip — it opened, but nobody could
 * see it. Rendering into <body> escapes that containing block for good.
 *
 * Also handles the things every dialog needs and none of ours had:
 * Escape to close, background scroll lock, initial focus, focus trap and
 * focus restoration.
 */

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog. */
  label: string;
  /** Where the panel is anchored. */
  side?: "left" | "right" | "bottom";
  /** Extra classes for the panel element. */
  panelClassName?: string;
  /** Panel background utility (kept separate so it never fights the default). */
  panelBg?: string;
  className?: string;
  children: React.ReactNode;
}

const SIDE_CLASS: Record<NonNullable<DrawerProps["side"]>, string> = {
  left: "absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col overflow-y-auto shadow-2xl",
  right:
    "absolute inset-y-0 right-0 flex w-[86%] max-w-sm flex-col overflow-y-auto shadow-2xl",
  bottom:
    "absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl p-6 shadow-2xl",
};

export default function Drawer({
  open,
  onClose,
  label,
  side = "left",
  panelClassName = "",
  panelBg = "bg-ivory-50",
  className = "",
  children,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;

    // Lock background scroll without the layout jumping sideways.
    const { body, documentElement } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;

    document.addEventListener("keydown", handleKeyDown, true);

    // Move focus into the panel so keyboard/screen-reader users land inside.
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target =
        panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      target.focus({ preventScroll: true });
    }, 0);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown, true);
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
      restoreFocusTo.current?.focus?.({ preventScroll: true });
    };
  }, [open, handleKeyDown]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] ${className}`}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {/* Click-away scrim. Hidden from assistive tech on purpose: the panel
          already offers a labelled close button and Escape. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 h-full w-full bg-forest-950/40 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`${SIDE_CLASS[side]} ${panelBg} ${panelClassName}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
