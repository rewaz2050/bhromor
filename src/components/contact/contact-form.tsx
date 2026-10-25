"use client";

import { useId, useRef, useState } from "react";
import { IconCheck } from "@/components/ui/icons";
import { useLanguage } from "@/components/i18n/language-provider";
import {
  CONTACT_TOPICS,
  validateContact,
} from "@/lib/engagement";

/* Topic values are sent to the server as the English strings in
   CONTACT_TOPICS (the inbox and the admin filter rely on them); only the
   label the shopper reads is Bangla. */
const TOPIC_LABEL_BN: Record<string, string> = {
  "Order support": "অর্ডার সাপোর্ট",
  Delivery: "ডেলিভারি",
  "Product question": "পণ্য সম্পর্কে প্রশ্ন",
  "Return / exchange": "ফেরত / বদল",
  Feedback: "মতামত",
  Partnership: "ব্যবসায়িক সহযোগিতা",
};

export default function ContactForm() {
  const { t, lang } = useLanguage();
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  type Field = "name" | "phone" | "message";
  const [invalid, setInvalid] = useState<Partial<Record<Field, boolean>>>({});
  const fieldMessage = (field: Field) => t(field === "name" ? "contactForm.errName" : field === "phone" ? "contactForm.errPhone" : "contactForm.errMessage");
  const clearField = (field: Field) => {
    setInvalid(current => ({ ...current, [field]: false }));
    setError(null);
  };
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
      setInvalid({ name: !!checked.errors.name, phone: !!checked.errors.phone, message: !!checked.errors.message });
      const first = (["name", "phone", "message"] as const).find(field => checked.errors[field]);
      if (first) (formRef.current?.elements.namedItem(first) as HTMLElement | null)?.focus();
      // Show the first failing field in the shopper's language. The English
      // reasons from validateContact stay on the server contract.
      setError(
        checked.errors.name
          ? t("contactForm.errName")
          : checked.errors.phone
            ? t("contactForm.errPhone")
            : checked.errors.message
              ? t("contactForm.errMessage")
              : t("contactForm.fixFields"),
      );
      return;
    }
    setInvalid({});
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
      if (!res.ok || data?.sent !== true) {
        setError(res.status === 429 ? t("contactForm.tooMany") : t("contactForm.sendFail"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("contactForm.reachFail"));
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    const first = name.trim().split(/\s+/)[0] ?? "";
    return (
      <div role="status" className="flex h-full min-h-[320px] flex-col items-center justify-center rounded-3xl bg-forest-50 p-8 text-center ring-1 ring-forest-100">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-forest-800 text-ivory-50">
          <IconCheck className="h-6 w-6" />
        </span>
        <h3
          lang={lang === "bn" ? "bn" : undefined}
          className={`font-display mt-5 text-xl font-medium text-forest-900 ${lang === "bn" ? "font-bengali" : ""}`}
        >
          {t("contactForm.sentTitle")}
        </h3>
        <p
          lang={lang === "bn" ? "bn" : undefined}
          className={`mt-2 max-w-sm text-sm leading-6 text-ink-soft ${lang === "bn" ? "font-bengali" : ""}`}
        >
          {t("contactForm.sentBody").replace("{name}", first ? `, ${first}` : "")}
        </p>
      </div>
    );
  }

  const inputClass =
    "h-12 w-full rounded-2xl bg-ivory-50 px-4 text-sm ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500";
  const labelClass = "mb-1.5 block text-sm font-medium text-ink";

  return (
    <form
      ref={formRef}
      noValidate
      aria-busy={sending}
      onSubmit={(e) => void submit(e)}
      className="rounded-2xl bg-paper p-5 ring-1 ring-line sm:p-7"
    >
      <h2
        lang={lang === "bn" ? "bn" : undefined}
        className={`font-display text-2xl font-medium text-forest-900 ${lang === "bn" ? "font-bengali" : ""}`}
      >
        {t("contactForm.title")}
      </h2>
      <p
        lang={lang === "bn" ? "bn" : undefined}
        className={`mt-2 text-sm leading-6 text-ink-soft ${lang === "bn" ? "font-bengali" : ""}`}
      >
        {t("contactForm.sub")}
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span id={`${id}-name-label`} className={labelClass}>{t("contactForm.name")}</span>
          <input
            required
            disabled={sending}
            maxLength={80}
            name="name"
            aria-labelledby={`${id}-name-label`}
            aria-invalid={!!invalid.name}
            aria-describedby={invalid.name ? `${id}-name-error` : undefined}
            value={name}
            onChange={(e) => { setName(e.target.value); clearField("name"); }}
            placeholder={t("contactForm.namePlaceholder")}
            autoComplete="name"
            className={inputClass}
          />
          {invalid.name && <span id={`${id}-name-error`} className="mt-1.5 block text-xs text-rose-700">{fieldMessage("name")}</span>}
        </label>
        <label className="block">
          <span id={`${id}-phone-label`} className={labelClass}>{t("contactForm.phone")}</span>
          <input
            required
            type="tel"
            pattern="(\+?88)?01[0-9]{9}"
            disabled={sending}
            maxLength={24}
            name="phone"
            aria-labelledby={`${id}-phone-label`}
            aria-invalid={!!invalid.phone}
            aria-describedby={invalid.phone ? `${id}-phone-error` : undefined}
            value={phone}
            onChange={(e) => { setPhone(e.target.value); clearField("phone"); }}
            placeholder="017XXXXXXXX"
            autoComplete="tel"
            className={inputClass}
          />
          {invalid.phone && <span id={`${id}-phone-error`} className="mt-1.5 block text-xs text-rose-700">{fieldMessage("phone")}</span>}
        </label>
      </div>
      <label className="mt-4 block">
        <span className={labelClass}>{t("contactForm.topic")}</span>
        <select
          disabled={sending}
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="h-12 w-full rounded-2xl bg-ivory-50 px-4 text-sm text-ink ring-1 ring-line focus:ring-2 focus:ring-forest-500"
        >
          {CONTACT_TOPICS.map((option) => (
            <option key={option} value={option}>
              {lang === "bn" ? (TOPIC_LABEL_BN[option] ?? option) : option}
            </option>
          ))}
        </select>
      </label>
      <label className="mt-4 block">
        <span id={`${id}-message-label`} className={labelClass}>{t("contactForm.message")}</span>
        <textarea
          required
          rows={5}
          disabled={sending}
          maxLength={2000}
          name="message"
            aria-labelledby={`${id}-message-label`}
          aria-invalid={!!invalid.message}
          aria-describedby={invalid.message ? `${id}-message-error` : undefined}
          value={message}
          onChange={(e) => { setMessage(e.target.value); clearField("message"); }}
          placeholder={t("contactForm.messagePlaceholder")}
          className="w-full rounded-2xl bg-ivory-50 px-4 py-3 text-sm ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-500"
        />
        {invalid.message && <span id={`${id}-message-error`} className="mt-1.5 block text-xs text-rose-700">{fieldMessage("message")}</span>}
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
        {sending ? t("contactForm.sending") : t("contactForm.send")}
      </button>
    </form>
  );
}
