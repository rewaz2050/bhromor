/**
 * Engagement domain (contact inbox · newsletter · CMS/media/notif clients).
 *
 * Client-safe: pure types, validators, row mappers.
 * message store. Server data-access lives in `./db/engagement.ts`.
 */

import {
  HOME_DEFAULTS,
  resolveSettings,
  type HomeSettings,
} from "./home-cms";
import {
  sanitizeSettings,
  SETTINGS_DEFAULTS,
  type AdminSettings,
} from "./settings-store";
import {
  KIND_LABEL as NOTIF_KIND_LABEL,
  type Notif,
  type NotifKind,
} from "./notification-store";
import type {
  DbContactMessage,
  DbMediaLibrary,
  DbNewsletterSubscriber,
  DbNotification,
} from "./db/types";

/* ------------------------------------------------------------------ */
/* Contact                                                             */
/* ------------------------------------------------------------------ */

export const CONTACT_TOPICS = [
  "Order support",
  "Delivery",
  "Product question",
  "Return / exchange",
  "Feedback",
  "Partnership",
] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export type ContactStatus = "new" | "read" | "replied";

export interface ContactMessage {
  id: string;
  name: string;
  phone: string;
  topic: string;
  message: string;
  status: ContactStatus;
  /** Epoch ms (rows store timestamptz). */
  at: number;
}

export interface ContactInput {
  name: string;
  phone: string;
  topic: string;
  message: string;
}

export interface ContactValidation {
  ok: boolean;
  errors: Partial<Record<keyof ContactInput, string>>;
  /** Cleaned values — only meaningful when ok. */
  value: ContactInput;
}

const clean = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export const normalizeBdPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("880") ? digits.slice(3) : digits;
  return local.startsWith("0") ? local : `0${local}`;
};

export const isPlausibleBdPhone = (phone: string): boolean =>
  /^01[3-9]\d{8}$/.test(normalizeBdPhone(phone));

export const validateContact = (raw: unknown): ContactValidation => {
  const b = (raw ?? {}) as Record<string, unknown>;
  const value: ContactInput = {
    name: clean(b.name, 80),
    phone: clean(b.phone, 24),
    topic: (CONTACT_TOPICS as readonly string[]).includes(
      typeof b.topic === "string" ? b.topic : "",
    )
      ? (b.topic as string)
      : CONTACT_TOPICS[0],
    message: clean(b.message, 2000),
  };
  const errors: ContactValidation["errors"] = {};
  if (value.name.length < 2) errors.name = "Tell us your name.";
  if (!isPlausibleBdPhone(value.phone)) {
    errors.phone = "Enter a valid Bangladeshi mobile number.";
  }
  if (value.message.length < 10) {
    errors.message = "Tell us a little more — at least a sentence.";
  }
  return { ok: Object.keys(errors).length === 0, errors, value };
};

export const mapContactMessage = (row: DbContactMessage): ContactMessage => ({
  id: row.id,
  name: row.name,
  phone: row.phone,
  topic: row.topic,
  message: row.message,
  status: row.status,
  at: Date.parse(row.created_at) || 0,
});

/* ------------------------------------------------------------------ */
/* Newsletter (table-based, no third party)                            */
/* ------------------------------------------------------------------ */

export type SubscriberStatus = "subscribed" | "unsubscribed";

export interface Subscriber {
  id: string;
  email: string;
  status: SubscriberStatus;
  /** Unsubscribe token — staff-only, never rendered publicly. */
  token: string;
  at: number;
}

export const cleanEmail = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase().slice(0, 254) : "";

export const isPlausibleEmail = (email: string): boolean =>
  email.length >= 5 &&
  email.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const mapSubscriber = (row: DbNewsletterSubscriber): Subscriber => ({
  id: row.id,
  email: row.email,
  status: row.status,
  token: row.token,
  at: Date.parse(row.created_at) || 0,
});

const csvCell = (value: string): string =>
  /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

/** Staff export: subscribed emails as CSV (header + one row each). */
export const subscribersToCsv = (subs: Subscriber[]): string => {
  const lines = ["email,status,subscribed_at"];
  for (const s of subs) {
    lines.push(
      [csvCell(s.email), s.status, new Date(s.at).toISOString()].join(","),
    );
  }
  return `${lines.join("\n")}\n`;
};

/* ------------------------------------------------------------------ */
/* Homepage CMS + ops settings (stored in site_settings)               */
/* ------------------------------------------------------------------ */

export const HOMEPAGE_SETTING_KEY = "homepage";
export const OPS_SETTING_KEY = "ops";

const cap = (value: unknown, fallback: string, max: number): string => {
  const s = typeof value === "string" ? value.trim() : "";
  return (s === "" ? fallback : s).slice(0, max);
};

/**
 * resolveSettings() plus length caps + trimming so a hostile draft can
 * never store megabytes of hero copy. Pure — used by the API route and
 * the admin editor alike.
 */
export const sanitizeHomeSettings = (raw: unknown): HomeSettings => {
  const r = resolveSettings(raw);
  return {
    announcement: {
      enabled: r.announcement.enabled === true,
      text: cap(r.announcement.text, HOME_DEFAULTS.announcement.text, 160),
    },
    hero: {
      eyebrow: cap(r.hero.eyebrow, HOME_DEFAULTS.hero.eyebrow, 40),
      title1: cap(r.hero.title1, HOME_DEFAULTS.hero.title1, 80),
      title2: cap(r.hero.title2, HOME_DEFAULTS.hero.title2, 80),
      subtitle: cap(r.hero.subtitle, HOME_DEFAULTS.hero.subtitle, 200),
      primaryLabel: cap(
        r.hero.primaryLabel,
        HOME_DEFAULTS.hero.primaryLabel,
        40,
      ),
    },
    sections: r.sections,
  };
};

export const sanitizeOpsSettings = (raw: unknown): AdminSettings =>
  sanitizeSettings(
    (raw as { value?: unknown } | null)?.value ?? raw ?? SETTINGS_DEFAULTS,
  );

/* ------------------------------------------------------------------ */
/* Notifications                                                       */
/* ------------------------------------------------------------------ */

const NOTIF_KINDS: readonly NotifKind[] = ["order", "review", "stock", "system"];

export const mapNotification = (row: DbNotification): Notif => ({
  id: row.id,
  kind: (NOTIF_KINDS as readonly string[]).includes(row.kind)
    ? (row.kind as NotifKind)
    : "system",
  title: row.title,
  body: row.body,
  at: Date.parse(row.created_at) || 0,
  read: row.read === true,
  ...(row.href ? { href: row.href } : {}),
});

export const notifKindLabel = (kind: NotifKind): string =>
  NOTIF_KIND_LABEL[kind];

/* ------------------------------------------------------------------ */
/* Media library rows → MediaItem                                      */
/* ------------------------------------------------------------------ */

export type LibraryMediaType = "image" | "video" | "youtube";

export interface LibraryMediaItem {
  id: string;
  url: string;
  alt: string;
  label: string;
  mediaType: LibraryMediaType;
  at: number;
}

const asLibraryMediaType = (value: unknown): LibraryMediaType =>
  value === "video" || value === "youtube" ? value : "image";

export const mapLibraryMedia = (row: DbMediaLibrary): LibraryMediaItem => ({
  id: row.id,
  url: row.url,
  alt: row.alt,
  label: row.label,
  mediaType: asLibraryMediaType(row.media_type),
  at: Date.parse(row.created_at) || 0,
});
