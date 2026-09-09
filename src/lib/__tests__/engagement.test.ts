import { describe, expect, it, beforeEach } from "vitest";
import {
  CONTACT_TOPICS,
  addDemoMessage,
  cleanEmail,
  getDemoMessages,
  isPlausibleBdPhone,
  isPlausibleEmail,
  mapContactMessage,
  mapLibraryMedia,
  mapNotification,
  mapSubscriber,
  normalizeBdPhone,
  resetDemoMessages,
  sanitizeHomeSettings,
  sanitizeOpsSettings,
  setDemoMessageStatus,
  subscribersToCsv,
  validateContact,
} from "../engagement";
import { HOME_DEFAULTS } from "../home-cms";

describe("contact validation", () => {
  const good = {
    name: "Rahim Uddin",
    phone: "01712345678",
    topic: CONTACT_TOPICS[0],
    message: "My order has not arrived yet, please help.",
  };

  it("accepts a complete message", () => {
    const checked = validateContact(good);
    expect(checked.ok).toBe(true);
    expect(checked.errors).toEqual({});
    expect(checked.value.phone).toBe("01712345678");
  });

  it("rejects short names, bad phones and short messages", () => {
    expect(validateContact({ ...good, name: "A" }).ok).toBe(false);
    expect(validateContact({ ...good, phone: "123" }).errors.phone).toContain(
      "Bangladeshi",
    );
    expect(validateContact({ ...good, message: "hi" }).errors.message).toContain(
      "sentence",
    );
  });

  it("falls back to the first topic for unknown input", () => {
    const checked = validateContact({ ...good, topic: "Free money" });
    expect(checked.value.topic).toBe(CONTACT_TOPICS[0]);
  });
});

describe("Bangladeshi phone checks", () => {
  it("normalises +880/880 prefixes", () => {
    expect(normalizeBdPhone("+8801712345678")).toBe("01712345678");
    expect(normalizeBdPhone("8801712345678")).toBe("01712345678");
    expect(normalizeBdPhone("01712-345678")).toBe("01712345678");
  });

  it("accepts operator prefixes 013–019 only", () => {
    expect(isPlausibleBdPhone("01712345678")).toBe(true);
    expect(isPlausibleBdPhone("01312345678")).toBe(true);
    expect(isPlausibleBdPhone("01212345678")).toBe(false);
    expect(isPlausibleBdPhone("0171234567")).toBe(false);
  });
});

describe("newsletter email checks", () => {
  it("trims and lowercases", () => {
    expect(cleanEmail("  RAHIM@Example.COM ")).toBe("rahim@example.com");
    expect(cleanEmail(42)).toBe("");
  });

  it("accepts plausible emails only", () => {
    expect(isPlausibleEmail("rahim@example.com")).toBe(true);
    expect(isPlausibleEmail("no-at-sign")).toBe(false);
    expect(isPlausibleEmail("a@b")).toBe(false);
  });
});

describe("homepage sanitizer", () => {
  it("merges partial payloads over defaults", () => {
    const s = sanitizeHomeSettings({ hero: { title1: "Hello" } });
    expect(s.hero.title1).toBe("Hello");
    expect(s.hero.title2).toBe(HOME_DEFAULTS.hero.title2);
    expect(s.sections.hero).toBe(true);
  });

  it("caps hostile string lengths", () => {
    const s = sanitizeHomeSettings({
      announcement: { enabled: true, text: "x".repeat(500) },
      hero: { title1: "y".repeat(500) },
    });
    expect(s.announcement.text.length).toBeLessThanOrEqual(160);
    expect(s.hero.title1.length).toBeLessThanOrEqual(80);
  });

  it("returns defaults for non-objects", () => {
    expect(sanitizeHomeSettings(null)).toEqual(HOME_DEFAULTS);
    expect(sanitizeHomeSettings("nope")).toEqual(HOME_DEFAULTS);
  });
});

describe("ops sanitizer", () => {
  it("accepts direct and wrapped values", () => {
    expect(sanitizeOpsSettings({ lowStockThreshold: 3 })).toEqual({
      lowStockThreshold: 3,
    });
    expect(
      sanitizeOpsSettings({ value: { lowStockThreshold: 9 } }),
    ).toEqual({ lowStockThreshold: 9 });
    expect(sanitizeOpsSettings({})).toEqual({ lowStockThreshold: 5 });
  });
});

describe("row mappers", () => {
  it("maps contact rows with epoch timestamps", () => {
    const m = mapContactMessage({
      id: "c1",
      name: "Rahim",
      phone: "01712345678",
      topic: "Delivery",
      message: "Where is my parcel?",
      status: "new",
      created_at: "2026-09-09T10:00:00.000Z",
    });
    expect(m.at).toBe(Date.parse("2026-09-09T10:00:00.000Z"));
    expect(m.topic).toBe("Delivery");
  });

  it("maps subscriber, library and notification rows", () => {
    const s = mapSubscriber({
      id: "s1",
      email: "a@b.com",
      status: "subscribed",
      token: "tok",
      created_at: "2026-09-09T10:00:00.000Z",
    });
    expect(s.email).toBe("a@b.com");

    const media = mapLibraryMedia({
      id: "m1",
      url: "https://x/y.jpg",
      alt: "alt",
      label: "label",
      created_at: "2026-09-09T10:00:00.000Z",
    });
    expect(media.url).toBe("https://x/y.jpg");

    const n = mapNotification({
      id: "n1",
      recipient: "u1",
      kind: "order",
      title: "T",
      body: "B",
      href: "/admin/orders/1",
      read: false,
      created_at: "2026-09-09T10:00:00.000Z",
    });
    expect(n.kind).toBe("order");
    expect(n.href).toBe("/admin/orders/1");

    const unknown = mapNotification({
      id: "n2",
      recipient: "u1",
      kind: "carrier-pigeon",
      title: "T",
      body: "",
      href: null,
      read: true,
      created_at: "bad-date",
    });
    expect(unknown.kind).toBe("system");
    expect(unknown.href).toBeUndefined();
    expect(unknown.at).toBe(0);
  });
});

describe("subscriber CSV export", () => {
  it("writes a header plus quoted rows", () => {
    const csv = subscribersToCsv([
      { id: "1", email: "a@b.com", status: "subscribed", token: "t", at: 0 },
      {
        id: "2",
        email: 'we,"ird@c.com',
        status: "unsubscribed",
        token: "t",
        at: 0,
      },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("email,status,subscribed_at");
    expect(lines).toHaveLength(3);
    expect(lines[2]).toContain('"we,""ird@c.com"');
  });
});

describe("demo message store", () => {
  beforeEach(() => resetDemoMessages());

  it("adds, lists and re-statuses messages", () => {
    expect(getDemoMessages()).toEqual([]);
    const m = addDemoMessage({
      name: "Rahim",
      phone: "01712345678",
      topic: CONTACT_TOPICS[0],
      message: "Hello, I need help with my order please.",
    });
    expect(m.status).toBe("new");
    expect(getDemoMessages()).toHaveLength(1);
    setDemoMessageStatus(m.id, "replied");
    expect(getDemoMessages()[0].status).toBe("replied");
    resetDemoMessages();
    expect(getDemoMessages()).toEqual([]);
  });
});
