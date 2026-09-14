"use client";

/**
 * Admin — Live shopping (P1 #9).
 *
 * The shop's control room for its OWN live stream (YouTube Live, Facebook
 * Live, …): schedule a session, pick the pieces in the order they come on
 * air, paste the live link, tap Start when the stream is really live, mark
 * the piece on air, tap End when it's over. The site only ever shows "LIVE"
 * between the shop's own Start and End taps.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  IconArrowRight,
  IconCheck,
  IconClose,
  IconClock,
  IconExternal,
  IconPlus,
} from "@/components/ui/icons";
import { formatBdt } from "@/lib/format";
import type { LiveSession } from "@/lib/live";
import type { Product } from "@/lib/catalog";

interface SessionsData {
  sessions: LiveSession[];
}

interface CatalogData {
  products: Product[];
}

const fmtWhen = (ms?: number): string =>
  ms
    ? new Date(ms).toLocaleString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** epoch ms → the value a <input type="datetime-local"> wants (local time). */
const toLocalInput = (ms: number): string => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

interface FormState {
  title: string;
  description: string;
  streamUrl: string;
  startsAt: string; // datetime-local value
  productIds: string[];
}

const emptyForm = (): FormState => ({
  title: "",
  description: "",
  streamUrl: "",
  startsAt: toLocalInput(Date.now() + 3600_000),
  productIds: [],
});

export default function AdminLivePage() {
  const [sessions, setSessions] = useState<LiveSession[] | null>(null);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/live", { cache: "no-store" });
      if (res.ok) setSessions(((await res.json()) as SessionsData).sessions);
    } catch {
      /* keep what we have */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch-on-mount
    void refresh();
    fetch("/api/admin/products", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CatalogData | null) => {
        if (d)
          setCatalog(
            (d.products ?? [])
              // Seeds omit status/active entirely — absence means live.
              .filter((p) => p.status !== "draft" && p.active !== false)
              .sort((a, b) => a.name.localeCompare(b.name)),
          );
      })
      .catch(() => undefined);
  }, [refresh]);

  const say = useCallback((kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    if (kind === "ok") setTimeout(() => setMsg(null), 6000);
  }, []);

  const act = useCallback(
    async (
      key: string,
      path: string,
      init?: RequestInit,
    ): Promise<LiveSession | null> => {
      setBusy(key);
      setMsg(null);
      try {
        const res = await fetch(path, {
          cache: "no-store",
          ...init,
          headers: init?.body ? { "Content-Type": "application/json" } : undefined,
        });
        const data = (await res.json().catch(() => null)) as {
          error?: string;
          session?: LiveSession;
        } | null;
        if (!res.ok) {
          say("err", data?.error ?? "That action failed — please try again.");
          return null;
        }
        if (data?.session) say("ok", "Saved.");
        await refresh();
        return data?.session ?? null;
      } catch {
        say("err", "Could not reach the server — check your connection.");
        return null;
      } finally {
        setBusy(null);
      }
    },
    [refresh, say],
  );

  const live = sessions?.find((s) => s.status === "live") ?? null;
  const upcoming = useMemo(
    () =>
      (sessions ?? [])
        .filter((s) => s.status === "scheduled")
        .sort((a, b) => a.scheduledStart - b.scheduledStart)[0] ?? null,
    [sessions],
  );
  const history = useMemo(
    () =>
      (sessions ?? [])
        .filter((s) => s.status === "ended")
        .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
        .slice(0, 12),
    [sessions],
  );

  const matched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return catalog
      .filter(
        (p) =>
          !form.productIds.includes(p.id) &&
          (p.name.toLowerCase().includes(q) || p.slug.includes(q)),
      )
      .slice(0, 8);
  }, [catalog, search, form.productIds]);

  const saveSession = () => {
    const startsAt = form.startsAt ? new Date(form.startsAt).getTime() : NaN;
    const body = {
      title: form.title,
      description: form.description,
      streamUrl: form.streamUrl,
      startsAt,
      productIds: form.productIds,
    };
    if (editingId) {
      void act(`save-${editingId}`, `/api/admin/live/sessions/${editingId}`, {
        method: "PUT",
        body: JSON.stringify(body),
      }).then(() => {
        setEditingId(null);
        setForm(emptyForm());
      });
    } else {
      void act("save-new", "/api/admin/live/sessions", {
        method: "POST",
        body: JSON.stringify(body),
      }).then(() => setForm(emptyForm()));
    }
  };

  const beginEdit = (s: LiveSession) => {
    setEditingId(s.id);
    setForm({
      title: s.title,
      description: s.description,
      streamUrl: s.streamUrl,
      startsAt: toLocalInput(s.scheduledStart),
      productIds: s.products.map((p) => p.productId),
    });
    setMsg(null);
    document.getElementById("live-session-form")?.scrollIntoView({ behavior: "smooth" });
  };

  const productById = useMemo(
    () => new Map(catalog.map((p) => [p.id, p])),
    [catalog],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-gold-600">
            Live shopping
          </p>
          <h1 className="font-display mt-1 text-3xl font-medium tracking-tight text-forest-900">
            Sessions &amp; the live stream
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-soft">
            You stream on your own platform — this page is the shopping
            surface: the pieces, the order, and the honest LIVE state between
            your Start and End taps.
          </p>
        </div>
        <Link
          href="/live"
          className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-4 py-2 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700"
        >
          Open the live page <IconExternal className="h-3.5 w-3.5" />
        </Link>
      </header>

      {msg && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm font-medium ring-1 ${
            msg.kind === "ok"
              ? "bg-forest-50 text-forest-900 ring-forest-200"
              : "bg-rose-50 text-rose-800 ring-rose-200"
          }`}
        >
          {msg.text}
        </p>
      )}

      {/* ------------------------------------------------ the active one -- */}
      {live ? (
        <section className="overflow-hidden rounded-3xl bg-white ring-2 ring-red-400">
          <div className="flex flex-wrap items-center gap-3 border-b border-line bg-red-50/60 px-5 py-4">
            <span className="inline-flex items-center gap-2 rounded-full bg-red-600 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-white">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
              Live
            </span>
            <h2 className="font-display min-w-0 flex-1 truncate text-lg font-medium text-forest-900">
              {live.title}
            </h2>
            <span className="text-xs text-ink-soft">
              started {fmtWhen(live.liveAt)}
            </span>
            {live.streamUrl && (
              <a
                href={live.streamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-forest-800 hover:underline"
              >
                stream <IconExternal className="h-3 w-3" />
              </a>
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void act(`end-${live.id}`, `/api/admin/live/sessions/${live.id}/end`, { method: "POST" })}
              className="rounded-full bg-forest-800 px-4 py-1.5 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
            >
              {busy === `end-${live.id}` ? "Ending…" : "End session"}
            </button>
          </div>
          <div className="space-y-2 px-5 py-4">
            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              Tap the piece on air — the live page puts it first, with the red
              badge
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {live.products.map((p) => (
                <button
                  key={p.productId}
                  type="button"
                  onClick={() =>
                    void act(`show-${p.productId}`, `/api/admin/live/sessions/${live.id}/showing`, {
                      method: "POST",
                      body: JSON.stringify({
                        productId: p.onAir ? null : p.productId,
                      }),
                    })
                  }
                  disabled={busy !== null}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition-colors disabled:opacity-60 ${
                    p.onAir
                      ? "bg-red-50 ring-red-400"
                      : "bg-white ring-line hover:bg-ivory-50"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      p.onAir ? "bg-red-600 text-white" : "bg-ivory-100 text-ink-soft"
                    }`}
                  >
                    {p.onAir ? (
                      <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                    ) : (
                      <IconCheck className="h-4 w-4" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">
                      {p.name}
                    </span>
                    <span className="text-xs text-ink-soft">
                      {formatBdt(p.price)}
                      {!p.inStock && " · out of stock"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : upcoming ? (
        <section className="rounded-3xl bg-white p-5 ring-1 ring-line">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-white">
              <IconClock className="h-3 w-3" />
              Next
            </span>
            <h2 className="font-display min-w-0 flex-1 truncate text-lg font-medium text-forest-900">
              {upcoming.title}
            </h2>
            <span className="text-xs text-ink-soft">
              scheduled {fmtWhen(upcoming.scheduledStart)} ·{" "}
              {upcoming.products.length} pieces
            </span>
            {upcoming.streamUrl ? (
              <a
                href={upcoming.streamUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-forest-800 hover:underline"
              >
                stream <IconExternal className="h-3 w-3" />
              </a>
            ) : (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-300">
                no live link yet — add it before starting
              </span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null || !upcoming.streamUrl.trim()}
              title={upcoming.streamUrl.trim() ? undefined : "Add the live link first"}
              onClick={() => void act(`start-${upcoming.id}`, `/api/admin/live/sessions/${upcoming.id}/start`, { method: "POST" })}
              className="rounded-full bg-red-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === `start-${upcoming.id}` ? "Starting…" : "Start live now"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => beginEdit(upcoming)}
              className="rounded-full bg-ivory-100 px-4 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-ivory-200 disabled:opacity-60"
            >
              Edit
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (window.confirm("Delete this scheduled session?"))
                  void act(`del-${upcoming.id}`, `/api/admin/live/sessions/${upcoming.id}`, { method: "DELETE" });
              }}
              className="rounded-full px-4 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-300 transition-colors hover:bg-rose-50 disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </section>
      ) : (
        <section className="rounded-3xl border border-dashed border-line bg-ivory-50/50 p-6 text-center">
          <p className="text-sm text-ink-soft">
            No session live or scheduled — create one below when you plan to
            go live.
          </p>
        </section>
      )}

      {/* ------------------------------------------------ the form -------- */}
      <section
        id="live-session-form"
        className="rounded-3xl bg-white p-5 ring-1 ring-line"
      >
        <h2 className="font-display text-lg font-medium text-forest-900">
          {editingId ? "Edit the scheduled session" : "Schedule a live session"}
        </h2>
        <p className="mt-1 text-xs leading-5 text-ink-soft">
          Title, when, the live link (YouTube Live link works best — it embeds
          right on the page), and the pieces in the order you&rsquo;ll show
          them. Editable until the session starts.
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-ink">Title *</span>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              maxLength={120}
              placeholder="Eid collection — new arrivals on air"
              className="mt-1 w-full rounded-xl border-0 bg-ivory-50 px-3.5 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-600 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-ink">Starts (your local time) *</span>
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
              className="mt-1 w-full rounded-xl border-0 bg-ivory-50 px-3.5 py-2.5 text-sm text-ink ring-1 ring-line focus:ring-2 focus:ring-forest-600 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold text-ink">
              Live link (YouTube Live, Facebook Live, …)
            </span>
            <input
              value={form.streamUrl}
              onChange={(e) => setForm((f) => ({ ...f, streamUrl: e.target.value }))}
              maxLength={500}
              placeholder="https://www.youtube.com/live/… — the page embeds it when it&rsquo;s YouTube"
              className="mt-1 w-full rounded-xl border-0 bg-ivory-50 px-3.5 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-600 focus:outline-none"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-xs font-semibold text-ink">Short description</span>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              maxLength={500}
              rows={2}
              placeholder="What the session is about — shown on the live page."
              className="mt-1 w-full rounded-xl border-0 bg-ivory-50 px-3.5 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-600 focus:outline-none"
            />
          </label>
        </div>

        {/* pieces picker */}
        <div className="mt-5">
          <p className="text-xs font-semibold text-ink">
            Pieces in this session ({form.productIds.length}/30) — order = the
            order they come on air
          </p>
          <div className="relative mt-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the catalog to add a piece…"
              className="w-full rounded-xl border-0 bg-ivory-50 px-3.5 py-2.5 text-sm text-ink ring-1 ring-line placeholder:text-ink-soft/50 focus:ring-2 focus:ring-forest-600 focus:outline-none"
            />
            {matched.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-line">
                {matched.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setForm((f) =>
                          f.productIds.length < 30
                            ? { ...f, productIds: [...f.productIds, p.id] }
                            : f,
                        );
                        setSearch("");
                      }}
                      className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-sm hover:bg-ivory-50"
                    >
                      <IconPlus className="h-3.5 w-3.5 shrink-0 text-forest-700" />
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">
                        {p.name}
                      </span>
                      <span className="text-xs text-ink-soft">
                        {formatBdt(p.price)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {form.productIds.length > 0 && (
            <ol className="mt-3 space-y-1.5">
              {form.productIds.map((id, i) => {
                const p = productById.get(id);
                return (
                  <li
                    key={id}
                    className="flex items-center gap-2.5 rounded-xl bg-ivory-50 px-3 py-2 ring-1 ring-line"
                  >
                    <span className="w-5 text-center text-xs font-bold text-ink-soft">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                      {p ? p.name : id}
                    </span>
                    {p && <span className="text-xs text-ink-soft">{formatBdt(p.price)}</span>}
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={i === 0}
                      onClick={() =>
                        setForm((f) => {
                          const ids = [...f.productIds];
                          [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
                          return { ...f, productIds: ids };
                        })
                      }
                      className="rounded-md px-1.5 py-0.5 text-xs text-ink-soft hover:bg-ivory-200 disabled:opacity-30"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === form.productIds.length - 1}
                      onClick={() =>
                        setForm((f) => {
                          const ids = [...f.productIds];
                          [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]];
                          return { ...f, productIds: ids };
                        })
                      }
                      className="rounded-md px-1.5 py-0.5 text-xs text-ink-soft hover:bg-ivory-200 disabled:opacity-30"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label="Remove"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          productIds: f.productIds.filter((x) => x !== id),
                        }))
                      }
                      className="rounded-md p-1 text-rose-600 hover:bg-rose-50"
                    >
                      <IconClose className="h-3.5 w-3.5" />
                    </button>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={saveSession}
            className="inline-flex items-center gap-1.5 rounded-full bg-forest-800 px-5 py-2 text-sm font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:opacity-60"
          >
            <IconCheck className="h-4 w-4" />
            {editingId ? "Save changes" : "Schedule session"}
          </button>
          {editingId && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm());
                setMsg(null);
              }}
              className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft hover:bg-ivory-100 disabled:opacity-60"
            >
              Cancel
            </button>
          )}
        </div>
      </section>

      {/* ------------------------------------------------ history --------- */}
      {history.length > 0 && (
        <section>
          <h2 className="font-display mb-3 text-lg font-medium text-forest-900">
            Past sessions
          </h2>
          <ul className="space-y-2">
            {history.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-line"
              >
                <IconArrowRight className="h-4 w-4 shrink-0 text-ink-soft" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {s.title}
                </span>
                <span className="text-xs text-ink-soft">
                  {s.liveAt ? `live ${fmtWhen(s.liveAt)}` : "never started"} ·
                  ended {fmtWhen(s.endedAt)} · {s.products.length} pieces
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!sessions && (
        <p className="text-center text-sm text-ink-soft" aria-busy="true">
          Loading sessions…
        </p>
      )}
    </div>
  );
}
