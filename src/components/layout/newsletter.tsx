"use client";

import { useState } from "react";
import { cleanEmail, isPlausibleEmail } from "@/lib/engagement";
import { IconCheck } from "@/components/ui/icons";

/** A hosted opt-in form owns consent/unsubscribe; never pretend a local click subscribes. */
export function newsletterSignupUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = cleanEmail(email);
    if (!isPlausibleEmail(value)) {
      setState("error");
      setError("Enter a valid email address.");
      return;
    }
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = (await res.json().catch(() => null)) as {
        subscribed?: boolean;
        error?: string;
      } | null;
      if (!res.ok) {
        setState("error");
        setError(data?.error ?? "Could not save — please try again.");
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setError("Could not reach the shop — check your connection.");
    }
  };

  if (state === "done") {
    return (
      <p className="mt-6 flex items-start gap-2 rounded-2xl bg-white/10 px-4 py-3 text-sm leading-6 text-ivory-100">
        <IconCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold-200" />
        You’re on the list — new collections and offers, straight to your
        inbox.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-6">
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="newsletter-email" className="sr-only">
          Email address
        </label>
        <input
          id="newsletter-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          className="h-12 w-full rounded-full border border-white/25 bg-white/10 px-5 text-sm text-ivory-100 placeholder:text-ivory-100/50 focus:border-gold-300 focus:outline-none"
        />
        <button
          type="submit"
          disabled={state === "sending"}
          className="editorial-button shrink-0 bg-gold-200 text-forest-950 hover:bg-gold-300 disabled:opacity-60"
        >
          {state === "sending" ? "Joining…" : "Join the list"}
        </button>
      </div>
      {state === "error" && error && (
        <p role="alert" className="mt-3 text-xs leading-5 text-gold-200">
          {error}
        </p>
      )}
      <p className="mt-3 text-xs leading-6 text-ivory-100/60">
        One email a month, unsubscribe anytime.
      </p>
    </form>
  );
}

export default function Newsletter({ signupUrl }: { signupUrl?: string }) {
  const url = newsletterSignupUrl(signupUrl);
  return (
    <div className="w-full border border-white/20 p-6 sm:p-8">
      <p className="font-display text-2xl text-ivory-100">
        A little inspiration in your inbox.
      </p>
      <p className="mt-3 text-sm leading-7 text-ivory-100/70">
        New collections, exclusive offers and seasonal edits. Join the list
        below — one email a month, unsubscribe anytime.
      </p>
      {url ? (
        <>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="editorial-button mt-6 w-full bg-gold-200 text-forest-950 hover:bg-gold-300"
          >
            Join the list ↗
          </a>
          <p className="mt-3 text-xs leading-6 text-ivory-100/60">
            Opens our email signup page in a new tab. Enter your email and
            confirm your preferences there.
          </p>
        </>
      ) : (
        <NewsletterForm />
      )}
    </div>
  );
}
