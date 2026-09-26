"use client";

/**
 * Password field with a show / hide toggle (apply = sign up, 2026-09-26).
 *
 * Applicants type their password once on a phone keyboard and then need it
 * again at login — letting them see what they typed removes most of the
 * "wrong password" support chats an e-mail-free onboarding would otherwise
 * generate. Pass the page's own input class; the component only reserves
 * room for the toggle. The toggle carries visible text only (no aria-label)
 * so `getByLabelText(/password/)` still resolves to the input.
 */

import { useState, type InputHTMLAttributes } from "react";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Toggle captions in the page's language. */
  toggle?: { show: string; hide: string };
};

export default function PasswordInput({
  toggle = { show: "Show", hide: "Hide" },
  className = "",
  ...rest
}: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="relative block">
      <input {...rest} type={visible ? "text" : "password"} className={`${className} pr-20`} />
      <button
        type="button"
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
        className="absolute right-1 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg px-2.5 text-xs font-semibold text-forest-800 transition-colors hover:bg-forest-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500/50"
      >
        {visible ? toggle.hide : toggle.show}
      </button>
    </span>
  );
}
