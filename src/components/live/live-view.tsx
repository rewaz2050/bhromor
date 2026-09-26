"use client";

/**
 * Live shopping page (P1 #9) — the shopping surface around the shop's real
 * stream.
 *
 * Honest by construction: the "LIVE" state comes from the shop's own Start
 * tap (server-driven), the video is the shop's own stream (YouTube embed or
 * its watch link), and every piece shown is a real catalog row at its real
 * price. Nothing here is generated, simulated or faked:
 *   - live     → player + on-air piece + session pieces
 *   - upcoming → schedule + countdown + piece preview
 *   - none     → a calm "check back" state
 * Polls /api/live every 45s so the shopper sees start/end/on-air changes
 * without refreshing.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/components/cart/cart-provider";
import { IconArrowRight, IconBag, IconClock, IconExternal } from "@/components/ui/icons";
import { youtubeEmbedUrl } from "@/lib/media";
import { formatBdt } from "@/lib/format";
import { liveState, type LiveSession, type LiveSessionProduct } from "@/lib/live";
import { usePoll } from "@/lib/use-poll";

interface LiveData {
  live: LiveSession | null;
  upcoming: LiveSession | null;
  /** The poll's own timestamp — time judgments stay pure at render. */
  fetchedAt: number;
}

const POLL_MS = 45_000;

const fmtWhen = (ms: number): string =>
  new Date(ms).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

/** Ticking countdown to a future timestamp (the honest "starts in"). */
function Countdown({ to }: { to: number }) {
  const [left, setLeft] = useState(() => Math.max(0, to - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, to - Date.now())), 1000);
    return () => clearInterval(t);
  }, [to]);
  const s = Math.floor(left / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const parts = [
    d > 0 ? `${d}d` : null,
    h > 0 ? `${h}h` : null,
    m > 0 ? `${m}m` : null,
    `${sec}s`,
  ].filter(Boolean) as string[];
  return (
    <span className="font-mono tabular-nums">{parts.join(" ")}</span>
  );
}

function PieceCard({
  piece,
  onAir,
}: {
  piece: LiveSessionProduct;
  onAir?: boolean;
}) {
  const { addItem, openBag } = useCart();
  return (
    <div
      className={`group relative flex flex-col overflow-hidden rounded-3xl bg-paper ring-1 transition-shadow hover:shadow-lg ${
        onAir ? "ring-2 ring-red-500" : "ring-line"
      }`}
    >
      <Link
        href={`/product/${piece.slug}`}
        className="relative block aspect-[4/5] overflow-hidden bg-ivory-100"
      >
        {piece.image ? (
          <Image
            src={piece.image}
            alt={piece.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs uppercase tracking-widest text-ink-soft/50">
            No photo
          </div>
        )}
        {onAir && (
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-wider text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
            On air
          </span>
        )}
        {!piece.inStock && (
          <span className="absolute right-3 top-3 rounded-full bg-forest-950/85 px-2.5 py-1 text-[0.62rem] font-semibold uppercase tracking-wider text-ivory-100">
            Out of stock
          </span>
        )}
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <Link
          href={`/product/${piece.slug}`}
          className="line-clamp-2 text-sm font-medium leading-5 text-ink hover:underline"
        >
          {piece.name}
        </Link>
        <p className="text-[0.95rem] font-semibold text-forest-900">
          {formatBdt(piece.price)}
        </p>
        <button
          type="button"
          disabled={!piece.inStock}
          onClick={() => {
            addItem(piece.productId, piece.defaultVariantLabel, 1, "live");
            openBag();
          }}
          className="mt-auto inline-flex items-center justify-center gap-1.5 rounded-full bg-forest-800 px-3 py-2 text-xs font-semibold text-ivory-50 transition-colors hover:bg-forest-700 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft"
        >
          <IconBag className="h-3.5 w-3.5" />
          {piece.inStock ? "Add to bag" : "Sold out"}
        </button>
      </div>
    </div>
  );
}

function VideoBlock({ session }: { session: LiveSession }) {
  if (session.youtubeId) {
    return (
      <div className="relative aspect-video w-full overflow-hidden rounded-3xl bg-forest-950 ring-1 ring-line">
        <iframe
          src={youtubeEmbedUrl(session.youtubeId, true)}
          title={`${session.title} — live video`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full"
        />
      </div>
    );
  }
  if (session.streamUrl) {
    return (
      <a
        href={session.streamUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex aspect-video w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl bg-forest-950 text-center ring-1 ring-line"
      >
        <span className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-white">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
          Watch the live
        </span>
        <span className="max-w-sm px-6 text-xs text-ivory-100/70">
          Opens in a new tab — come right back to order the pieces from here
        </span>
        <IconExternal className="h-4 w-4 text-ivory-100/60" />
      </a>
    );
  }
  // A live session with no link yet: say exactly that, never a black box.
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-3xl bg-forest-950 text-center">
      <IconClock className="h-8 w-8 text-ivory-100/40" />
      <p className="text-sm font-medium text-ivory-100">
        The live link goes up when the shop starts streaming
      </p>
      <p className="text-xs text-ivory-100/60">
        The pieces below are ready to add to your bag right now
      </p>
    </div>
  );
}

function LiveSessionView({ session }: { session: LiveSession }) {
  const onAir = session.products.find((p) => p.onAir) ?? null;
  const rest = session.products.filter((p) => p.onAir !== true);
  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-red-600 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white">
          <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
          Live now
        </span>
        {session.liveAt ? (
          <span className="text-xs text-ink-soft">
            started {fmtWhen(session.liveAt)}
          </span>
        ) : null}
      </header>
      <h1 className="font-display text-3xl font-medium tracking-tight text-forest-900 sm:text-4xl">
        {session.title}
      </h1>
      {session.description ? (
        <p className="max-w-2xl leading-7 text-ink-soft">{session.description}</p>
      ) : null}

      <VideoBlock session={session} />

      {onAir && (
        <section aria-label="On air now">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-ink-soft">
            On air right now
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <PieceCard piece={onAir} onAir />
            </div>
          </div>
        </section>
      )}

      {rest.length > 0 && (
        <section aria-label="In this session">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-ink-soft">
            In this session — {rest.length}{" "}
            {rest.length === 1 ? "piece" : "pieces"}
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {rest.map((p) => (
              <PieceCard key={p.productId} piece={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function UpcomingSessionView({
  session,
  nowMs,
}: {
  session: LiveSession;
  /** The poll's own timestamp — kept pure at render, fresh each poll. */
  nowMs: number;
}) {
  const started = nowMs >= session.scheduledStart;
  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-gold-500 px-3.5 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white">
          <IconClock className="h-3.5 w-3.5" />
          Coming up
        </span>
        <span className="text-sm text-ink-soft">
          {started ? "scheduled — waiting to start" : "starts"}{" "}
          <strong className="font-semibold text-ink">{fmtWhen(session.scheduledStart)}</strong>
          {!started && (
            <>
              {" "}
              · in <Countdown to={session.scheduledStart} />
            </>
          )}
        </span>
      </header>
      <h1 className="font-display text-3xl font-medium tracking-tight text-forest-900 sm:text-4xl">
        {session.title}
      </h1>
      {session.description ? (
        <p className="max-w-2xl leading-7 text-ink-soft">{session.description}</p>
      ) : null}

      {session.streamUrl && (
        <a
          href={session.streamUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-semibold text-forest-800 hover:underline"
        >
          Follow the stream <IconExternal className="h-3.5 w-3.5" />
        </a>
      )}

      {session.products.length > 0 && (
        <section aria-label="Pieces in this session">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.16em] text-ink-soft">
            The {session.products.length}{" "}
            {session.products.length === 1 ? "piece" : "pieces"} coming on air
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {session.products.map((p) => (
              <PieceCard key={p.productId} piece={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EmptyView() {
  return (
    <div className="mx-auto max-w-md rounded-3xl bg-paper p-10 text-center ring-1 ring-line">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ivory-100">
        <IconClock className="h-6 w-6 text-ink-soft" />
      </span>
      <h2 className="font-display mt-4 text-2xl font-medium text-forest-900">
        No live shopping right now
      </h2>
      <p className="mt-2 leading-6 text-ink-soft">
        When the shop goes live, the stream and every piece it shows will be
        right here — with the bag one tap away.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-forest-800 hover:underline"
      >
        Browse the collection <IconArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}

export default function LiveView() {
  const [data, setData] = useState<LiveData | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/live", { cache: "no-store" });
      if (!res.ok) {
        // Backend unconfigured / error → no live UI at all (never a fake LIVE).
        setData({ live: null, upcoming: null, fetchedAt: Date.now() });
        return;
      }
      const json = (await res.json()) as Omit<LiveData, "fetchedAt">;
      setData({
        live: json.live ?? null,
        upcoming: json.upcoming ?? null,
        fetchedAt: Date.now(),
      });
    } catch {
      setData((prev) =>
        prev ?? { live: null, upcoming: null, fetchedAt: Date.now() },
      );
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot fetch-on-mount
    void load();
  }, [load]);
  // Re-check every 45 s while visible; catch up the moment the tab returns.
  usePoll(load, POLL_MS);

  if (!data) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <div className="h-7 w-40 animate-pulse rounded-full bg-ivory-100" />
        <div className="h-10 w-2/3 animate-pulse rounded-2xl bg-ivory-100" />
        <div className="aspect-video w-full animate-pulse rounded-3xl bg-ivory-100" />
      </div>
    );
  }

  const session =
    data.live && liveState(data.live) === "live"
      ? data.live
      : data.upcoming;

  return (
    <div>
      {session ? (
        liveState(session) === "live" ? (
          <LiveSessionView session={session} />
        ) : (
          <UpcomingSessionView session={session} nowMs={data.fetchedAt} />
        )
      ) : (
        <EmptyView />
      )}
    </div>
  );
}
