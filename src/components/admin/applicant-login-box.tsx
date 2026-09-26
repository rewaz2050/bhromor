"use client";

/**
 * The "login" box on an Admin → Shops / Riders card (apply = sign up,
 * 2026-09-26).
 *
 * Applications arrive with their login already linked, so the box mostly
 * tells staff what the applicant will sign in with — plus the two hand-offs
 * this onboarding needs without any SMS/e-mail provider:
 *   • a WhatsApp deep link with the approval message once the row is active;
 *   • a staff password reset that shows a temporary password ONCE.
 * Legacy / manually created rows without a login keep the "Link" form.
 */

import { useState } from "react";
import { field, label } from "@/components/admin/form-ui";
import {
  applicantLoginUrl,
  approvalWhatsAppLink,
  passwordResetWhatsAppLink,
  type ApplicantKind,
} from "@/lib/onboarding-messages";

const ghostButton =
  "inline-flex min-h-9 items-center justify-center rounded-full bg-paper px-4 py-1.5 text-xs font-semibold text-forest-800 ring-1 ring-forest-300 transition-colors hover:bg-forest-800 hover:text-ivory-50 disabled:opacity-60 disabled:hover:bg-paper disabled:hover:text-forest-800";

export function ApplicantLoginBox({
  kind,
  name,
  phone,
  email,
  status,
  linked: linkedInitially,
  live,
  onLink,
  onResetPassword,
}: {
  kind: ApplicantKind;
  name: string;
  phone: string;
  email?: string | null;
  status: "pending" | "active" | "suspended";
  linked: boolean;
  live: boolean;
  onLink: (email: string) => Promise<boolean>;
  onResetPassword: () => Promise<string | null>;
}) {
  const [linked, setLinked] = useState(linkedInitially);
  const [linkEmail, setLinkEmail] = useState(email ?? "");
  const [linking, setLinking] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const noun = kind === "vendor" ? "vendor" : "rider";
  const loginPath = kind === "vendor" ? "/vendor/login" : "/rider/login";
  const approvalLink =
    status === "active" ? approvalWhatsAppLink({ kind, name, phone, email }) : null;
  const resetLink = passwordResetWhatsAppLink({ kind, name, phone });

  const reset = async () => {
    if (
      !window.confirm(
        `Reset the ${noun} password for “${name}”? The old password stops working immediately; you will see the new one once.`,
      )
    ) {
      return;
    }
    setResetting(true);
    const value = await onResetPassword();
    setResetting(false);
    setCopied(false);
    if (value) setTempPassword(value);
  };

  const copy = async () => {
    if (!tempPassword) return;
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="rounded-xl bg-cream/70 p-3 ring-1 ring-line sm:col-span-2">
      <span className={label}>{kind === "vendor" ? "Vendor login" : "Rider login"}</span>
      {linked ? (
        <div className="space-y-3">
          <p className="text-xs font-medium text-forest-800">
            Linked — {email ? <strong>{email}</strong> : `the ${noun}`} signs in at{" "}
            <a
              href={applicantLoginUrl(kind)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2"
            >
              {loginPath}
            </a>{" "}
            with the password from the application
            {status === "active" ? "." : " the moment the row is approved (active)."}
          </p>
          <div className="flex flex-wrap gap-2">
            {status === "active" &&
              (approvalLink ? (
                <a
                  href={approvalLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={ghostButton}
                >
                  WhatsApp: approved, sign in →
                </a>
              ) : (
                <span className="text-xs text-ink-soft">
                  No WhatsApp link — the phone on file is not a BD mobile.
                </span>
              ))}
            <button
              type="button"
              disabled={resetting || !live}
              onClick={() => void reset()}
              className={ghostButton}
            >
              {resetting ? "Resetting…" : "Reset password"}
            </button>
          </div>
          {tempPassword && (
            <div
              role="status"
              className="rounded-xl bg-amber-50 p-3 text-xs text-amber-950 ring-1 ring-amber-200"
            >
              <p className="font-semibold">Temporary password — shown once</p>
              <p className="mt-1 flex flex-wrap items-center gap-2">
                <code className="rounded-md bg-white px-2 py-1 font-mono text-sm tracking-wider text-forest-900 ring-1 ring-amber-200">
                  {tempPassword}
                </code>
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="rounded-full bg-white px-3 py-1 font-semibold text-forest-800 ring-1 ring-amber-300 hover:bg-amber-100"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
                {resetLink && (
                  <a
                    href={resetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full bg-white px-3 py-1 font-semibold text-forest-800 ring-1 ring-amber-300 hover:bg-amber-100"
                  >
                    Open WhatsApp chat
                  </a>
                )}
              </p>
              <p className="mt-1.5 leading-relaxed">
                Pass it on by phone or paste it into the chat (the link never carries it).
                They sign in at {loginPath} and change it in their own settings. (If they can
                reach the login page themselves, “Forgot password?” there files a request you
                approve under Access requests — no password to read out.)
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className={`${field} flex-1`}
            value={linkEmail}
            onChange={(e) => setLinkEmail(e.target.value)}
            placeholder={`${noun} account email`}
            aria-label={kind === "vendor" ? "Vendor account email" : "Rider account email"}
            disabled={!live}
          />
          <button
            type="button"
            disabled={linking || !live || linkEmail.trim() === ""}
            onClick={() => {
              setLinking(true);
              void onLink(linkEmail.trim()).then((ok) => {
                setLinking(false);
                if (ok) setLinked(true);
              });
            }}
            className={ghostButton}
          >
            {linking ? "Linking…" : kind === "vendor" ? "Link vendor" : "Link rider"}
          </button>
        </div>
      )}
    </div>
  );
}
