"use client";

/**
 * ⌘K / Ctrl+K command palette for the admin (ops pass 2026-10-06).
 *
 * The sidebar groups made 26 links navigable by eye, but a grouped sidebar
 * still costs a scroll + a click. This is the shortcut: type a few letters
 * of what you want ("payo", "bkash", "coverage") and press ↵. An empty query
 * shows the pages you actually visited today, newest first.
 *
 * Keyboard: ↑ ↓ move, Home/End jump, ↵ open, Esc close. The dialog, focus
 * trap, focus restoration and scroll lock come from the shared Drawer. The
 * body is mounted only while the dialog is open (Drawer renders nothing when
 * closed), so every visit starts with an empty query and the top result —
 * no reset bookkeeping.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import Drawer from "@/components/ui/drawer";
import { IconSearch } from "@/components/ui/icons";
import {
  ADMIN_NAV_ITEMS,
  activeAdminNavItem,
  pendingFor,
  pendingNoun,
  pushRecentAdminNav,
  readRecentAdminNav,
  recentAdminNavServerSnapshot,
  searchAdminNav,
  subscribeRecentAdminNav,
  type AdminNavEntry,
  type AdminQueue,
} from "./admin-nav";

const HINT = "↑ ↓ move · ↵ open · esc close";
type QueueCounts = Partial<Record<AdminQueue, number>>;

function PaletteBody({
  recents,
  counts,
  onClose,
  inputRef,
}: {
  recents: readonly string[];
  counts: QueueCounts;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo<AdminNavEntry[]>(() => {
    const q = query.trim();
    if (q) return searchAdminNav(q).map((hit) => hit.item);
    // Recents first, then the rest of the sidebar in its own order.
    const recent = recents
      .map((href) => ADMIN_NAV_ITEMS.find((item) => item.href === href))
      .filter((item): item is AdminNavEntry => Boolean(item));
    const rest = ADMIN_NAV_ITEMS.filter(
      (item) => !recent.some((seen) => seen.href === item.href),
    );
    return [...recent, ...rest];
  }, [query, recents]);

  // Guard against an index left over from a longer result list.
  const activeIndex =
    results.length === 0 ? -1 : Math.min(active, results.length - 1);

  const go = useCallback(
    (item: AdminNavEntry): void => {
      onClose();
      pushRecentAdminNav(item.href);
      router.push(item.href);
    },
    [onClose, router],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + results.length) % results.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(results.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const item = results[activeIndex];
      if (item) go(item);
    }
  };

  return (
    <div className="flex max-h-[84vh] flex-col">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
        <IconSearch className="h-4 w-4 shrink-0 text-ink-soft" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="admin-palette-results"
          aria-activedescendant={
            activeIndex >= 0 ? `admin-palette-option-${activeIndex}` : undefined
          }
          aria-label="Jump to an admin page"
          placeholder="Jump to… orders, payouts, coverage"
          autoComplete="off"
          spellCheck={false}
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-soft/70"
        />
        <kbd className="hidden shrink-0 rounded border border-line px-1.5 py-0.5 text-[0.65rem] font-semibold text-ink-soft sm:block">
          esc
        </kbd>
      </div>

      <div
        id="admin-palette-results"
        role="listbox"
        aria-label="Admin pages"
        className="min-h-0 flex-1 overflow-y-auto p-2"
      >
        {results.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-ink-soft">
            Nothing matches “{query.trim()}”.
          </p>
        ) : (
          results.map((item, index) => {
            const waiting = pendingFor(item, counts);
            const selected = index === activeIndex;
            return (
              <button
                key={item.href}
                type="button"
                id={`admin-palette-option-${index}`}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onClick={() => go(item)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                  selected
                    ? "bg-forest-50 text-forest-900"
                    : "text-ink hover:bg-ivory-100"
                }`}
              >
                <item.icon
                  className={`h-4 w-4 shrink-0 ${selected ? "text-forest-700" : "text-ink-soft"}`}
                />
                <span className="flex-1 font-medium">{item.label}</span>
                {waiting > 0 && item.queue && (
                  <span className="rounded-full bg-gold-500 px-1.5 py-0.5 text-[0.62rem] font-bold leading-none text-white">
                    {waiting > 99 ? "99+" : waiting}
                    <span className="sr-only">
                      {` ${pendingNoun(item.queue)}${waiting === 1 ? "" : "s"} waiting`}
                    </span>
                  </span>
                )}
                <span className="shrink-0 text-[0.7rem] uppercase tracking-[0.14em] text-ink-soft">
                  {item.groupLabel}
                </span>
              </button>
            );
          })
        )}
      </div>

      <p className="border-t border-line px-4 py-2 text-[0.7rem] text-ink-soft">
        {HINT}
      </p>
    </div>
  );
}

export default function AdminCommandPalette({
  open,
  onClose,
  onOpen,
  pathname,
  counts,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  pathname: string;
  counts: QueueCounts;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // localStorage is the source of truth for recents; the store keeps React
  // in step with it when a visit changes the list.
  const recents = useSyncExternalStore(
    subscribeRecentAdminNav,
    readRecentAdminNav,
    recentAdminNavServerSnapshot,
  );

  /* ⌘K anywhere in the admin. Intercepted on the window so it works with
     focus in a table, a filter box or nowhere at all. */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpen();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onOpen]);

  // Remember where staff actually go. Recorded from the resolved nav item,
  // so /admin/orders/4821 counts as Orders.
  useEffect(() => {
    const item = activeAdminNavItem(pathname);
    if (item) pushRecentAdminNav(item.href);
  }, [pathname]);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      label="Jump to an admin page"
      side="center"
      panelBg="bg-paper"
      initialFocusRef={inputRef}
      className="z-[120]"
    >
      <PaletteBody
        recents={recents}
        counts={counts}
        onClose={onClose}
        inputRef={inputRef}
      />
    </Drawer>
  );
}
