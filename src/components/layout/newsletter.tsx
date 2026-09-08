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
      className="flex w-full flex-wrap items-center gap-3"
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
        className="h-14 min-w-0 flex-1 basis-48 border-0 border-b border-white/35 bg-transparent px-1 text-base text-white placeholder:text-white/50 focus:border-gold-300 focus-visible:outline-gold-300"
      />
      <button
        type="submit"
        className="h-14 shrink-0 border border-gold-300 bg-gold-200 px-7 text-xs font-medium uppercase tracking-widest text-forest-950 transition-colors hover:bg-gold-300"
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
