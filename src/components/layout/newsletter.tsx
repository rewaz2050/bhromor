"use client";

import { useState } from "react";
import { IconCheck } from "@/components/ui/icons";

export default function Newsletter() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!email.trim()) return;
        setDone(true);
        setEmail(""); // the field used to keep the address after subscribing
      }}
      className="mx-auto mt-6 flex max-w-md flex-wrap items-center gap-3"
    >
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="newsletter-email"
        type="email"
        required
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          if (done) setDone(false);
        }}
        placeholder="Your email address"
        className="h-12 min-w-0 flex-1 basis-52 rounded-full border-0 bg-white/10 px-6 text-sm text-white placeholder:text-white/50 ring-1 ring-white/25 focus:ring-2 focus:ring-gold-400"
      />
      <button
        type="submit"
        className="h-12 shrink-0 rounded-full bg-gold-500 px-7 text-sm font-semibold text-white transition-colors hover:bg-gold-600"
      >
        Subscribe
      </button>
      {done && (
        <p
          role="status"
          aria-live="polite"
          className="mt-2 flex w-full items-center justify-center gap-2 text-sm text-gold-200"
        >
          <IconCheck className="h-4 w-4" /> Thank you — we will keep you posted
          about new collections and offers.
        </p>
      )}
    </form>
  );
}
