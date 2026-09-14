"use client";

/**
 * Growth (§P0) — the four levers that move first orders for a clothing
 * marketplace, on one page, saving into the same ops document the checkout
 * prices with:
 *
 *   • Flash drop      — a clock the shop arms; 2 short windows a day
 *   • Complete sets   — panjabi + pajama + gamcha as one priced set
 *   • Gift mode       — wrap, card, receiver; the two fields that make a
 *                       clothing order a present
 *   • Referral        — ৳50 to the friend, ৳50 to you when it is delivered
 *
 * Plus the work list the levers create: who asked to be called when a price
 * drops (no SMS gateway exists — staff dial), and which referral rewards are
 * earned but not yet handed over.
 *
 * Every number here is a setting, not a promise: `ps_place_order` re-derives
 * the discount from this same document at placement, so arming a drop that the
 * database cannot honour is impossible by construction.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSettings } from "@/lib/use-settings";
import { useGrowth } from "@/lib/use-growth";
import { useCatalog } from "@/lib/use-catalog";
import { formatBdt } from "@/lib/format";
import { countdownLabel } from "@/lib/promos";
import type { BundleConfig, FlashConfig, FlashScope } from "@/lib/promos";
import type { GiftConfig } from "@/lib/gift";
import type { ReferralConfig } from "@/lib/referral";
import { field, hint, label } from "@/components/admin/form-ui";
import { IconBell, IconBolt, IconCheck, IconGift, IconTag, IconTrendDown, IconUser } from "@/components/ui/icons";

const taka = (paisa: number): string => String(paisa / 100);
const toPaisa = (raw: string, fallback: number): number => {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100);
};
const pct = (raw: string, fallback: number): number => {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0 || n > 90) return fallback;
  return n;
};

function Card({
  title,
  sub,
  icon,
  children,
}: {
  title: string;
  sub: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-line">
      <header className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg text-forest-900">{title}</h2>
          <p className="mt-0.5 text-xs leading-5 text-ink-soft">{sub}</p>
        </div>
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Toggle({
  on,
  onChange,
  text,
  textOff,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  text: string;
  textOff: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className={`flex h-11 w-full items-center justify-between gap-3 rounded-xl px-4 text-sm font-semibold ring-1 transition-colors ${
        on
          ? "bg-forest-800 text-white ring-forest-700"
          : "bg-white text-ink-soft ring-line hover:ring-forest-300"
      }`}
    >
      <span>{on ? text : textOff}</span>
      {on ? <IconCheck className="h-4 w-4" /> : null}
    </button>
  );
}

const Num = ({
  label: text,
  value,
  onChange,
  suffix,
  step = "1",
}: {
  label: string;
  value: string;
  onChange: (raw: string) => void;
  suffix?: string;
  step?: string;
}) => (
  <label className="block">
    <span className={label}>{text}</span>
    <span className="relative block">
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={field}
      />
      {suffix ? (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-soft">
          {suffix}
        </span>
      ) : null}
    </span>
  </label>
);

export default function AdminGrowthPage() {
  const { settings, save, live } = useSettings();
  const growth = useGrowth();
  const catalog = useCatalog();

  const [flash, setFlash] = useState<FlashConfig>(settings.flash);
  const [bundle, setBundle] = useState<BundleConfig>(settings.bundle);
  const [gift, setGift] = useState<GiftConfig>(settings.gift);
  const [referral, setReferral] = useState<ReferralConfig>(settings.referral);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // One-second clock for the countdown line — read in the effect, never in
  // render, so the label cannot disagree with itself between paints.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Adopt the live document when it lands (or after any other page saves it).
  useEffect(() => {
    if (dirty) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot adoption of the live document
    setFlash(settings.flash);
    setBundle(settings.bundle);
    setGift(settings.gift);
    setReferral(settings.referral);
  }, [settings, dirty]);

  const edit = <K extends keyof FlashConfig>(key: K, value: FlashConfig[K]) => {
    setDirty(true);
    setFlash((f) => ({ ...f, [key]: value }));
  };

  const commit = async () => {
    const ok = await save({
      ...settings,
      flash,
      bundle,
      gift,
      referral,
    });
    setDirty(false);
    setStatus(
      ok
        ? "সংরক্ষিত — storefront ও checkout দুটোই এখন এই সেটিংস পড়ছে"
        : "Could not save — please try again",
    );
    if (ok) await growth.refresh();
  };

  const countdown = useMemo(() => {
    const p = growth.promos.flash;
    if (!p.enabled) return "Offline — the drop is disarmed.";
    if (now === null) return "Checking the clock…";
    if (p.active && p.endsAtMs) {
      const ends = (p.asOf ? p.endsAtMs - p.asOf : 0) + (now - (p.asOf || now));
      return `LIVE NOW — ${p.discountPct}% off · ends in ${countdownLabel(ends)}`;
    }
    if (p.nextStartsAtMs) {
      const mins = Math.max(0, Math.round((p.nextStartsAtMs - now) / 60000));
      return `Armed — opens in ${Math.floor(mins / 60)}h ${mins % 60}m`;
    }
    return "Armed but no window matches today's clock.";
  }, [growth.promos.flash, now]);

  const products = catalog.products ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl text-forest-900">Growth</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Flash drop, complete sets, gift mode and referrals — one document, saved live.
          </p>
          {!live ? (
            <p className="mt-2 text-xs text-amber-800">
              Sign in as staff to change these — the page is read-only otherwise.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          {dirty ? <span className="text-xs font-medium text-amber-800">Unsaved changes</span> : null}
          <button
            type="button"
            onClick={() => void commit()}
            disabled={!live || !dirty}
            className="h-11 rounded-xl bg-forest-800 px-5 text-sm font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
      {status ? <p className="text-sm text-forest-800">{status}</p> : null}
      {growth.error ? <p className="text-sm text-rose-700">{growth.error}</p> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {/* ---------------- Flash drop ---------------- */}
        <Card
          title="Flash drop"
          sub="Two short windows a day. Scarcity only works if the clock is real — the storefront hides everything while this is off."
          icon={<IconBolt className="h-5 w-5" />}
        >
          <Toggle
            on={flash.enabled}
            onChange={(v) => edit("enabled", v)}
            text={`Drop armed — ${flash.discountPct}% off`}
            textOff="Disarmed (nothing runs)"
          />
          <p className="mt-2 text-xs font-semibold text-forest-800">{countdown}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={label}>Title (shown on the bar)</span>
              <input
                value={flash.title}
                onChange={(e) => edit("title", e.target.value.slice(0, 40))}
                className={field}
                placeholder="Eid Flash Drop"
              />
            </label>
            <Num
              label="Discount"
              value={String(flash.discountPct)}
              suffix="%"
              onChange={(raw) => edit("discountPct", pct(raw, flash.discountPct))}
            />
            <Num
              label="Max off per piece"
              value={taka(flash.maxDiscountPaisa)}
              suffix="৳"
              onChange={(raw) => edit("maxDiscountPaisa", toPaisa(raw, flash.maxDiscountPaisa))}
            />
            {flash.slots.map((slot, i) => (
              <div key={`${slot.start}-${i}`} className="rounded-xl bg-ivory-50 p-3 ring-1 ring-line">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-soft">
                  Window {i + 1}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="time"
                    value={slot.start}
                    onChange={(e) => {
                      setDirty(true);
                      setFlash((f) => ({
                        ...f,
                        slots: f.slots.map((s, j) =>
                          j === i ? { ...s, start: e.target.value } : s,
                        ),
                      }));
                    }}
                    className={field}
                  />
                  <span className="text-ink-soft">→</span>
                  <input
                    type="time"
                    value={slot.end}
                    onChange={(e) => {
                      setDirty(true);
                      setFlash((f) => ({
                        ...f,
                        slots: f.slots.map((s, j) =>
                          j === i ? { ...s, end: e.target.value } : s,
                        ),
                      }));
                    }}
                    className={field}
                  />
                </div>
              </div>
            ))}
            <label className="block sm:col-span-2">
              <span className={label}>Which products</span>
              <select
                value={flash.scope}
                onChange={(e) => edit("scope", e.target.value as FlashScope)}
                className={field}
              >
                <option value="featured">Featured picks only</option>
                <option value="all">Everything in stock</option>
                <option value="selected">A chosen list</option>
              </select>
            </label>
            {flash.scope === "selected" ? (
              <div className="sm:col-span-2">
                <p className={hint}>Tap the pieces that go in the drop.</p>
                <div className="mt-2 flex max-h-48 flex-wrap gap-1.5 overflow-y-auto">
                  {products.map((p) => {
                    const on = flash.productIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() =>
                          edit(
                            "productIds",
                            on
                              ? flash.productIds.filter((id) => id !== p.id)
                              : [...flash.productIds, p.id].slice(0, 60),
                          )
                        }
                        className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 ${
                          on ? "bg-forest-800 text-white ring-forest-700" : "bg-white text-ink ring-line"
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <p className={hint}>
            Slots are Asia/Dhaka times, <code>HH:MM</code>. The checkout and the badge read the
            same two windows — a drop that has ended cannot be claimed at payment.
          </p>
        </Card>

        {/* ---------------- Bundle sets ---------------- */}
        <Card
          title="Complete sets"
          sub="Panjabi + pajama + gamcha sold as one tap. This is the thing foodpanda cannot do with a plate of rice."
          icon={<IconTag className="h-5 w-5" />}
        >
          <Toggle
            on={bundle.enabled}
            onChange={(v) => {
              setDirty(true);
              setBundle((b) => ({ ...b, enabled: v }));
            }}
            text={`“${bundle.name}” is offered on matching products`}
            textOff="No sets offered"
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={label}>Set name</span>
              <input
                value={bundle.name}
                onChange={(e) => {
                  setDirty(true);
                  setBundle((b) => ({ ...b, name: e.target.value.slice(0, 30) }));
                }}
                className={field}
                placeholder="Eid Set"
              />
            </label>
            <Num
              label="Set discount"
              value={String(bundle.discountPct)}
              suffix="%"
              onChange={(raw) => {
                setDirty(true);
                setBundle((b) => ({ ...b, discountPct: pct(raw, b.discountPct) }));
              }}
            />
            <Num
              label="Pieces in a set"
              value={String(bundle.maxItems)}
              onChange={(raw) => {
                const n = Math.floor(Number(raw) || 0);
                setDirty(true);
                setBundle((b) => ({ ...b, maxItems: n < 2 || n > 6 ? b.maxItems : n }));
              }}
            />
            <Num
              label="Complements required"
              value={String(bundle.minComplements)}
              onChange={(raw) => {
                const n = Math.floor(Number(raw) || 0);
                setDirty(true);
                setBundle((b) => ({
                  ...b,
                  minComplements: n < 1 || n > 4 ? b.minComplements : n,
                }));
              }}
            />
          </div>
          <p className={hint}>
            A set only discounts a bag that actually holds every piece — remove one and the saving
            disappears. One automatic offer per order: if a drop is live and bigger, the drop wins.
          </p>
        </Card>

        {/* ---------------- Gift mode ---------------- */}
        <Card
          title="Gift mode"
          sub="Wrap, a hand-written card, and the receiver's name. Two fields at checkout — no new flow."
          icon={<IconGift className="h-5 w-5" />}
        >
          <Toggle
            on={gift.enabled}
            onChange={(v) => {
              setDirty(true);
              setGift((g) => ({ ...g, enabled: v }));
            }}
            text="Gift step is shown at checkout"
            textOff="Gift step hidden"
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Num
              label="Standard wrap fee"
              value={taka(gift.standardWrapFeePaisa)}
              suffix="৳"
              onChange={(raw) => {
                setDirty(true);
                setGift((g) => ({ ...g, standardWrapFeePaisa: toPaisa(raw, g.standardWrapFeePaisa) }));
              }}
            />
            <Num
              label="Premium hamper fee"
              value={taka(gift.premiumWrapFeePaisa)}
              suffix="৳"
              onChange={(raw) => {
                setDirty(true);
                setGift((g) => ({ ...g, premiumWrapFeePaisa: toPaisa(raw, g.premiumWrapFeePaisa) }));
              }}
            />
            <Num
              label="Card message limit"
              value={String(gift.maxMessageChars)}
              suffix="chars"
              onChange={(raw) => {
                const n = Math.floor(Number(raw) || 0);
                setDirty(true);
                setGift((g) => ({
                  ...g,
                  maxMessageChars: n < 40 || n > 600 ? g.maxMessageChars : n,
                }));
              }}
            />
          </div>
          <p className={hint}>
            Wraps costing nothing are not offered. The rider is told to hand it to the receiver and
            not to quote the price — gift orders hide the amount on the slip.
          </p>
        </Card>

        {/* ---------------- Referral ---------------- */}
        <Card
          title="Referral"
          sub="৳50 off a friend's first order, ৳50 to you when it is delivered. Codes belong to accounts, not to devices."
          icon={<IconUser className="h-5 w-5" />}
        >
          <Toggle
            on={referral.enabled}
            onChange={(v) => {
              setDirty(true);
              setReferral((r) => ({ ...r, enabled: v }));
            }}
            text={`“${formatBdt(referral.friendRewardPaisa)} you, ${formatBdt(referral.referrerRewardPaisa)} them” is live`}
            textOff="Referral paused"
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Num
              label="Friend's credit"
              value={taka(referral.friendRewardPaisa)}
              suffix="৳"
              onChange={(raw) => {
                setDirty(true);
                setReferral((r) => ({ ...r, friendRewardPaisa: toPaisa(raw, r.friendRewardPaisa) }));
              }}
            />
            <Num
              label="Your reward (on delivery)"
              value={taka(referral.referrerRewardPaisa)}
              suffix="৳"
              onChange={(raw) => {
                setDirty(true);
                setReferral((r) => ({ ...r, referrerRewardPaisa: toPaisa(raw, r.referrerRewardPaisa) }));
              }}
            />
            <Num
              label="Friend's minimum bag"
              value={taka(referral.minOrderPaisa)}
              suffix="৳"
              onChange={(raw) => {
                setDirty(true);
                setReferral((r) => ({ ...r, minOrderPaisa: toPaisa(raw, r.minOrderPaisa) }));
              }}
            />
            <Num
              label="Max rewards per person"
              value={String(referral.maxRewardsPerReferrer)}
              onChange={(raw) => {
                const n = Math.floor(Number(raw) || 0);
                setDirty(true);
                setReferral((r) => ({
                  ...r,
                  maxRewardsPerReferrer: n < 1 || n > 100 ? r.maxRewardsPerReferrer : n,
                }));
              }}
            />
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-ink-soft">
                <tr>
                  <th className="py-2 pr-3 font-medium">Code</th>
                  <th className="py-2 pr-3 font-medium">Owner</th>
                  <th className="py-2 pr-3 font-medium">Friends</th>
                  <th className="py-2 font-medium">Rewards minted</th>
                </tr>
              </thead>
              <tbody>
                {growth.codes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-3 text-ink-soft">
                      No codes shared yet — the account page mints one the first time someone
                      opens their share card.
                    </td>
                  </tr>
                ) : (
                  growth.codes.map((c) => (
                    <tr key={c.code} className="border-t border-line">
                      <td className="py-2 pr-3 font-mono">{c.code}</td>
                      <td className="py-2 pr-3">
                        {c.name || "—"} · {c.phone}
                      </td>
                      <td className="py-2 pr-3">{c.invited}</td>
                      <td className="py-2">{c.credited}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* ---------------- Waiting for a price ---------------- */}
      <Card
        title="Waiting for a price drop"
        sub="There is no SMS gateway, so this is a call list — the shop already confirms orders by phone."
        icon={<IconTrendDown className="h-5 w-5" />}
      >
        {growth.loading ? (
          <p className="text-sm text-ink-soft">Loading…</p>
        ) : growth.watches.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Nobody is waiting right now. The alert appears on every product page while price alerts
            are on.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {growth.watches.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{w.productName || w.productId}</span>
                <a
                  href={`tel:${w.phone}`}
                  className="font-mono text-xs text-forest-800 underline underline-offset-2"
                >
                  {w.phone}
                </a>
                {w.targetPaisa ? (
                  <span className="text-xs text-ink-soft">wants ≤ {formatBdt(w.targetPaisa)}</span>
                ) : null}
                <span className="text-xs text-ink-soft">
                  since {new Date(w.createdAt).toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className={hint}>
          When a price is saved lower than before, this list also arrives in the staff inbox once —
          no duplicate nagging for the same price.
        </p>
      </Card>

      {/* ---------------- Waiting for a restock ---------------- */}
      <Card
        title="Waiting for a restock"
        sub="Pieces that sold out with a call list attached. The inbox note arrives the moment one of these is flipped back in stock."
        icon={<IconBell className="h-5 w-5" />}
      >
        {growth.loading ? (
          <p className="text-sm text-ink-soft">Loading…</p>
        ) : growth.stockWatches.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Nobody is waiting on an out-of-stock piece right now.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {growth.stockWatches.map((w) => (
              <li key={w.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate">{w.productName || w.productId}</span>
                <a
                  href={`tel:${w.phone}`}
                  className="font-mono text-xs text-forest-800 underline underline-offset-2"
                >
                  {w.phone}
                </a>
                <span className="text-xs text-ink-soft">
                  since {new Date(w.createdAt).toISOString().slice(0, 10)}
                </span>
                {w.lastNotifiedAt ? (
                  <span className="text-xs text-ink-soft">
                    · notified {new Date(w.lastNotifiedAt).toISOString().slice(0, 10)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className={hint}>
          Same rule as price drops: a restock note goes to the staff inbox once per
          out-of-stock → in-stock flip — a piece that sells out again later earns a new one.
        </p>
      </Card>
    </div>
  );
}
