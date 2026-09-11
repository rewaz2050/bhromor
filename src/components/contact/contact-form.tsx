"use client";

import { useState } from "react";
import { IconCheck } from "@/components/ui/icons";
import {
  CONTACT_TOPICS,
  validateContact,
} from "@/lib/engagement";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [topic, setTopic] = useState<string>(CONTACT_TOPICS[0]);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const checked = validateContact({ name, phone, topic, message });
    if (!checked.ok) {
      setError(
        checked.errors.name ??
          checked.errors.phone ??
          checked.errors.message ??
          "Please fix the highlighted fields.",
      );
      return;
    }
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checked.value),
      });
      const data = (await res.json().catch(() => null)) as {
        sent?: boolean;
        error?: string;
      } | null;
      if (!res.ok) {
        setError(data?.error ?? "Could not send — please try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("Could not reach the shop — check your connection.");
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl bg-forest-50 p-8 text-center ring-1 ring-forest-100">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-forest-800 text-ivory-50">
          <IconCheck className="h-6 w-6" />
        </span>
        <h3 className="font-display mt-5 text-xl font-medium text-forest-900">
          Message received
        </h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-ink-soft">
          Thank you{name ? `, ${name.split(" ")[0]}` : ""}. We reply within a
          few hours during support hours (Sat–Thu, 9am–9pm).
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => void submit(e)}
      className="rounded-3xl bg-paper p-7 ring-1 ring-line"
    >
      <h2 className="font-display text-2xl font-medium text-forest-900">
        Send us a message
      </h2>
      <p className="mt-2 text-sm leading-6 text-ink-soft">
        Order, delivery or product questions — we read everything.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className="h-12 w-full rounded-2xl bg-ivory-50 px-4 text-sm ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink">
            Phone
          </span>
          <input
            required
            type="tel"
            pattern="(\+?88)?01[0-9]{9}"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="017XXXXXXXX"
            autoComplete="tel"
            className="h-12 w-full rounded-2xl bg-ivory-50 px-4 text-sm ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
          />
        </label>
      </div>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          Topic
        </span>
        <select
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="h-12 w-full rounded-2xl bg-ivory-50 px-4 text-sm text-ink ring-1 ring-line focus:ring-2 focus:ring-forest-500"
        >
          {CONTACT_TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="mt-4 block">
        <span className="mb-1.5 block text-sm font-medium text-ink">
          Message
        </span>
        <textarea
          required
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
          className="w-full rounded-2xl bg-ivory-50 px-4 py-3 text-sm ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
        />
      </label>
      {error && (
        <p role="alert" className="mt-4 text-sm leading-6 text-rose-700">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={sending}
        className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-forest-800 px-8 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
      >
        {sending ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
